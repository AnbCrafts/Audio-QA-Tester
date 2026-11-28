import os
import re
import uuid
import json
import hashlib
import secrets
import tempfile
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query, Request, Response, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, case, or_, and_, exists, text as sql_text

# Load environment variables before database/service imports
load_dotenv()

from database import get_db, run_schema_migrations, SessionLocal, DATABASE_URL
from models import (
    OrganizationModel,
    UserModel,
    CallAuditModel,
    TranscriptSegmentModel,
    CommitmentModel,
    AudioAssetModel,
    UploadSessionModel,
    AnalysisJobModel,
    AuditLogModel,
    WebhookEndpointModel,
    WebhookDeliveryModel,
    utcnow_naive,
)
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    CallHistoryItem,
    CommitmentStatusUpdate,
    AnalyticsOverview,
    PaginatedHistoryResponse,
    PaginatedCommitmentsResponse,
    OrgTokenQuotaResponse,
    UpdateOrgQuotaRequest,
    RegisterRequest,
    LoginRequest,
    UserProfileResponse,
    UploadInitRequest,
    UploadInitResponse,
    UploadCompleteResponse,
    AnalyzeAssetRequest,
    AnalysisJobCreateResponse,
    AnalysisJobStatusResponse,
    TranscriptSegmentUpdateRequest,
    CoachingInsightsResponse,
    TranscriptSearchHit,
    PaginatedSearchResponse,
    CreateMemberRequest,
    UpdateMemberRoleRequest,
    OrgMemberItem,
    AuditLogItem,
    PaginatedAuditLogsResponse,
    WebhookCreateRequest,
    WebhookEndpointItem,
    WebhookDeliveryItem,
)
from webhook_service import record_audit_log, validate_webhook_url
from audio_service import analyze_call_with_ai, reanalyze_from_transcript
from audio_chunker import probe_audio_duration
from storage_service import (
    CHUNK_SIZE_BYTES,
    MAX_UPLOAD_BYTES,
    UPLOAD_SESSION_TTL_SECONDS,
    VALID_AUDIO_EXTENSIONS,
    MIME_BY_EXT,
    sanitize_filename,
    validate_audio_magic_bytes,
    storage_provider,
)
from job_worker import (
    execute_analysis_job,
    cancel_job,
    persist_report_to_db,
    recover_orphaned_jobs_on_startup,
)
from cache_service import (
    compute_config_hash,
    get_cached_report,
    save_cached_report,
    get_audio_base_cache,
    save_audio_base_cache,
    cleanup_expired_cache,
    clear_all_cache,
)
from traffic_guard import (
    rate_limit_analysis,
    rate_limit_auth,
    analytics_single_flight,
    reserve_idempotency,
    complete_idempotency,
    release_idempotency,
)
from ai_gateway import (
    gemini_circuit,
    groq_circuit,
    DailyQuotaExceededError,
    get_org_daily_token_status,
    assert_org_daily_quota,
    estimate_audio_tokens,
)
from auth_service import (
    COOKIE_NAME,
    AuthUser,
    hash_password,
    verify_password,
    create_signed_token,
    decode_signed_token,
    extract_auth_user_from_request,
    get_current_user,
    require_admin,
)

# Run idempotent schema migrations and default workspace seeding on import
run_schema_migrations()


def _cleanup_stale_uploads() -> None:
    storage_provider.cleanup_stale_tmp()
    db = SessionLocal()
    try:
        now = utcnow_naive()
        stale = (
            db.query(UploadSessionModel)
            .filter(UploadSessionModel.status == "UPLOADING", UploadSessionModel.expires_at < now)
            .all()
        )
        for sess in stale:
            storage_provider.delete_upload_tmp(sess.id)
            sess.status = "EXPIRED"
        if stale:
            db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Startup Cleanup Warning] {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _cleanup_stale_uploads()
    cleanup_expired_cache()
    recover_orphaned_jobs_on_startup()
    yield


app = FastAPI(
    title="Inflect - Call Quality & Conversation Intelligence Platform",
    description="Multi-tenant Backend API with Chunked Resumable Uploads, 1-Hr Map-Reduce, SQL Aggregations, AI Resilience, and Per-Tenant Daily Token Quotas.",
    version="3.0.0",
    lifespan=lifespan,
)

_raw_origins = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5173",
)
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def _set_auth_cookie(response: Response, user: AuthUser) -> None:
    token = create_signed_token(
        {
            "userId": user.user_id,
            "email": user.email,
            "fullName": user.full_name,
            "orgId": user.org_id,
            "orgName": user.org_name,
            "role": user.role,
        }
    )
    is_secure = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=is_secure,
        max_age=86400 * 7,
        path="/",
    )


def _quota_exceeded_response(err: DailyQuotaExceededError) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        headers={"Retry-After": str(err.retry_after_seconds)},
        content={
            "detail": str(err),
            "code": "DAILY_QUOTA_EXCEEDED",
            "usedToday": err.used_today,
            "dailyLimit": err.daily_limit,
            "renewsAtUtc": err.renews_at_utc,
            "retryAfterSeconds": err.retry_after_seconds,
        },
    )


def _parse_cursor(cursor: Optional[str]) -> Optional[tuple[datetime, str]]:
    if not cursor or "|" not in cursor:
        return None
    ts_part, id_part = cursor.split("|", 1)
    try:
        dt = datetime.fromisoformat(ts_part)
        return dt, id_part
    except ValueError:
        return None


# =============================================================================
# AUTHENTICATION & WORKSPACE MULTI-TENANCY ENDPOINTS
# =============================================================================

@app.post("/api/auth/register", response_model=UserProfileResponse, dependencies=[Depends(rate_limit_auth)])
def register_workspace(payload: RegisterRequest, response: Response, db: Session = Depends(get_db)):
    clean_email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email == clean_email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    default_limit = int(os.getenv("DEFAULT_ORG_DAILY_TOKEN_LIMIT", "500000"))
    org = OrganizationModel(
        id=str(uuid.uuid4()),
        name=payload.workspaceName.strip(),
        daily_token_limit=default_limit,
    )
    db.add(org)
    db.flush()

    user = UserModel(
        id=str(uuid.uuid4()),
        email=clean_email,
        password_hash=hash_password(payload.password),
        full_name=payload.fullName.strip() or clean_email.split("@")[0],
        org_id=org.id,
        role="ADMIN",
    )
    db.add(user)
    db.commit()

    auth_user = AuthUser(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        org_id=org.id,
        org_name=org.name,
        role=user.role,
    )
    _set_auth_cookie(response, auth_user)
    return UserProfileResponse(
        userId=user.id,
        email=user.email,
        fullName=user.full_name,
        orgId=org.id,
        orgName=org.name,
        role=user.role,
    )


@app.post("/api/auth/login", response_model=UserProfileResponse, dependencies=[Depends(rate_limit_auth)])
def login_user(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    clean_email = payload.email.strip().lower()
    user = db.query(UserModel).filter(UserModel.email == clean_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    org = db.query(OrganizationModel).filter(OrganizationModel.id == user.org_id).first()
    org_name = org.name if org else "Workspace"
    auth_user = AuthUser(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        org_id=user.org_id,
        org_name=org_name,
        role=user.role,
    )
    _set_auth_cookie(response, auth_user)
    return UserProfileResponse(
        userId=user.id,
        email=user.email,
        fullName=user.full_name,
        orgId=user.org_id,
        orgName=org_name,
        role=user.role,
    )


@app.post("/api/auth/logout")
def logout_user(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"status": "logged_out"}


@app.get("/api/auth/me", response_model=UserProfileResponse)
def get_me(user: AuthUser = Depends(get_current_user)):
    return UserProfileResponse(
        userId=user.user_id,
        email=user.email,
        fullName=user.full_name,
        orgId=user.org_id,
        orgName=user.org_name,
        role=user.role,
    )


# =============================================================================
# HEALTH, CACHE & PER-TENANT TOKEN QUOTA ENDPOINTS
# =============================================================================

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    db_ok = False
    try:
        db.execute(CallAuditModel.__table__.select().limit(1))
        db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "healthy",
        "service": "Inflect Call Intelligence Engine",
        "gemini_configured": bool(gemini_key),
        "groq_configured": bool(groq_key),
        "database_connected": db_ok,
        "gemini_circuit": gemini_circuit.state(),
        "groq_circuit": groq_circuit.state(),
    }


@app.delete("/api/cache")
def clear_cache(user: AuthUser = Depends(require_admin), db: Session = Depends(get_db)):
    deleted = clear_all_cache(org_id=user.org_id)
    analytics_single_flight.invalidate(user.org_id)
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="CACHE_CLEARED",
        target_id=user.org_id,
        metadata={"deletedEntries": deleted},
    )
    db.commit()
    return {"status": "cache_cleared", "deleted_entries": deleted}


@app.get("/api/org/token-quota", response_model=OrgTokenQuotaResponse)
@app.get("/api/analytics/tokens", response_model=OrgTokenQuotaResponse)
def get_tenant_token_quota(user: AuthUser = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns per-tenant daily token usage, remaining balance, limit, and next UTC renewal time."""
    return get_org_daily_token_status(db, user.org_id)


@app.patch("/api/org/token-quota", response_model=OrgTokenQuotaResponse)
def update_tenant_token_quota(
    payload: UpdateOrgQuotaRequest,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only endpoint to adjust the organization's daily token limit."""
    org = db.query(OrganizationModel).filter(OrganizationModel.id == user.org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    old_limit = org.daily_token_limit
    org.daily_token_limit = payload.dailyLimit
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="QUOTA_UPDATED",
        target_id=user.org_id,
        metadata={"previousLimit": old_limit, "dailyLimit": payload.dailyLimit},
    )
    db.commit()
    return get_org_daily_token_status(db, user.org_id)


# =============================================================================
# CHUNKED RESUMABLE UPLOAD, RANGE STREAMING & ASYNC JOB ENDPOINTS
# =============================================================================

@app.post("/api/uploads/init", response_model=UploadInitResponse, dependencies=[Depends(rate_limit_analysis)])
def init_chunked_upload(
    payload: UploadInitRequest,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    clean_name = sanitize_filename(payload.filename)
    ext = os.path.splitext(clean_name)[1].lower()
    if ext not in VALID_AUDIO_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    if payload.sizeBytes > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Audio file exceeds maximum supported limit of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    audio_hash = payload.sha256.strip().lower()[:24]

    # Tenant-scoped deduplication check (never cross tenants!)
    existing_asset = (
        db.query(AudioAssetModel)
        .filter(AudioAssetModel.org_id == user.org_id, AudioAssetModel.sha256 == audio_hash)
        .first()
    )
    if existing_asset and os.path.isfile(storage_provider.get_local_path(existing_asset.storage_key)):
        return UploadInitResponse(
            deduplicated=True,
            assetId=existing_asset.id,
            chunkSizeBytes=CHUNK_SIZE_BYTES,
            totalChunks=0,
            receivedChunks=[],
            durationSeconds=existing_asset.duration_seconds,
        )

    total_chunks = max(1, (payload.sizeBytes + CHUNK_SIZE_BYTES - 1) // CHUNK_SIZE_BYTES)
    now = utcnow_naive()
    existing_sess = (
        db.query(UploadSessionModel)
        .filter(
            UploadSessionModel.org_id == user.org_id,
            UploadSessionModel.sha256 == audio_hash,
            UploadSessionModel.total_size_bytes == payload.sizeBytes,
            UploadSessionModel.status == "UPLOADING",
            UploadSessionModel.expires_at > now,
        )
        .order_by(desc(UploadSessionModel.created_at))
        .first()
    )
    if existing_sess:
        return UploadInitResponse(
            deduplicated=False,
            uploadId=existing_sess.id,
            chunkSizeBytes=CHUNK_SIZE_BYTES,
            totalChunks=existing_sess.total_chunks,
            receivedChunks=list(existing_sess.received_chunks or []),
        )

    session = UploadSessionModel(
        id=str(uuid.uuid4()),
        org_id=user.org_id,
        filename=clean_name,
        mime_type=payload.mimeType or MIME_BY_EXT.get(ext, "audio/mp4"),
        total_size_bytes=payload.sizeBytes,
        total_chunks=total_chunks,
        received_chunks=[],
        sha256=audio_hash,
        status="UPLOADING",
        expires_at=now + timedelta(seconds=UPLOAD_SESSION_TTL_SECONDS),
    )
    db.add(session)
    db.commit()

    return UploadInitResponse(
        deduplicated=False,
        uploadId=session.id,
        chunkSizeBytes=CHUNK_SIZE_BYTES,
        totalChunks=total_chunks,
        receivedChunks=[],
    )


@app.put("/api/uploads/{upload_id}/chunk/{chunk_index}")
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    chunk: UploadFile = File(...),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(UploadSessionModel)
        .filter(UploadSessionModel.id == upload_id, UploadSessionModel.org_id == user.org_id)
        .first()
    )
    if not session or session.status != "UPLOADING":
        raise HTTPException(status_code=404, detail="Upload session not found or inactive.")
    if session.expires_at < utcnow_naive():
        storage_provider.delete_upload_tmp(upload_id)
        session.status = "EXPIRED"
        db.commit()
        raise HTTPException(status_code=410, detail="Upload session expired. Please restart upload.")
    if chunk_index < 0 or chunk_index >= session.total_chunks:
        raise HTTPException(status_code=400, detail="Invalid chunk index.")

    try:
        written_bytes, leading_bytes = await storage_provider.save_chunk(upload_id, chunk_index, chunk)
    except ValueError as ve:
        raise HTTPException(status_code=413, detail=str(ve))

    if chunk_index == 0:
        is_valid, _ = validate_audio_magic_bytes(leading_bytes)
        if not is_valid:
            storage_provider.delete_upload_tmp(upload_id)
            session.status = "EXPIRED"
            db.commit()
            raise HTTPException(
                status_code=400,
                detail="File signature verification failed: uploaded content is not a valid audio file.",
            )

    received = set(session.received_chunks or [])
    received.add(chunk_index)
    session.received_chunks = sorted(received)
    db.commit()

    return {"uploadId": upload_id, "chunkIndex": chunk_index, "bytesWritten": written_bytes}


@app.post("/api/uploads/{upload_id}/complete", response_model=UploadCompleteResponse)
async def complete_chunked_upload(
    upload_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    session = (
        db.query(UploadSessionModel)
        .filter(UploadSessionModel.id == upload_id, UploadSessionModel.org_id == user.org_id)
        .first()
    )
    if not session or session.status != "UPLOADING":
        raise HTTPException(status_code=404, detail="Upload session not found or already completed.")

    received = set(session.received_chunks or [])
    expected = set(range(session.total_chunks))
    missing = sorted(expected - received)
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing upload chunks: {missing[:10]}")

    asset_id = str(uuid.uuid4())
    ext = os.path.splitext(session.filename)[1].lower()
    storage_key, assembled_size, assembled_hash = await asyncio.to_thread(
        storage_provider.assemble_chunks,
        upload_id,
        session.total_chunks,
        asset_id,
        ext,
    )

    if assembled_size != session.total_size_bytes:
        storage_provider.delete_asset(storage_key)
        raise HTTPException(
            status_code=400,
            detail=f"Size mismatch after assembly: expected {session.total_size_bytes}, got {assembled_size}",
        )

    if assembled_hash != session.sha256:
        storage_provider.delete_asset(storage_key)
        raise HTTPException(status_code=400, detail="SHA-256 checksum mismatch after chunk assembly.")

    final_path = storage_provider.get_local_path(storage_key)
    with open(final_path, "rb") as f:
        header = f.read(64)
    is_valid, detected_fmt = validate_audio_magic_bytes(header)
    if not is_valid:
        storage_provider.delete_asset(storage_key)
        raise HTTPException(status_code=400, detail="Assembled file failed audio magic-byte verification.")

    duration_sec = await asyncio.to_thread(probe_audio_duration, final_path)

    asset = AudioAssetModel(
        id=asset_id,
        org_id=user.org_id,
        sha256=assembled_hash,
        original_filename=session.filename,
        mime_type=session.mime_type,
        detected_format=detected_fmt or session.mime_type,
        size_bytes=assembled_size,
        duration_seconds=duration_sec,
        storage_key=storage_key,
    )
    db.add(asset)
    session.status = "COMPLETED"
    session.asset_id = asset_id
    db.commit()

    return UploadCompleteResponse(
        assetId=asset_id,
        sha256=assembled_hash,
        sizeBytes=assembled_size,
        durationSeconds=duration_sec,
        detectedFormat=asset.detected_format,
        audioUrl=f"/api/assets/{asset_id}/stream",
    )


@app.get("/api/assets/{asset_id}/stream")
def stream_audio_asset(
    asset_id: str,
    request: Request,
    media_token: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Streams persisted tenant audio with HTTP 206 Partial Content byte-range support."""
    org_id: Optional[str] = None
    auth_user = extract_auth_user_from_request(request)
    if auth_user:
        org_id = auth_user.org_id
    elif media_token:
        m_payload = decode_signed_token(media_token)
        if m_payload and m_payload.get("scope") == "media" and m_payload.get("assetId") == asset_id:
            org_id = m_payload.get("orgId")

    if not org_id:
        raise HTTPException(status_code=401, detail="Authentication required.")

    asset = (
        db.query(AudioAssetModel)
        .filter(AudioAssetModel.id == asset_id, AudioAssetModel.org_id == org_id)
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail="Audio asset not found.")

    file_path = storage_provider.get_local_path(asset.storage_key)
    if not os.path.isfile(file_path):
        raise HTTPException(status_code=404, detail="Stored audio file missing on disk.")

    file_size = os.path.getsize(file_path)
    content_type = asset.detected_format or asset.mime_type or "audio/mp4"
    range_header = request.headers.get("range")

    if range_header:
        m = re.match(r"bytes=(\d*)-(\d*)", range_header.strip())
        if not m:
            raise HTTPException(status_code=416, detail="Invalid Range header")
        start = int(m.group(1)) if m.group(1) else 0
        end = int(m.group(2)) if m.group(2) else file_size - 1
        end = min(end, file_size - 1)
        if start > end or start >= file_size:
            raise HTTPException(status_code=416, detail="Requested range not satisfiable")

        chunk_len = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_len),
        }
        return StreamingResponse(
            storage_provider.iter_file_range(asset.storage_key, start, end),
            status_code=206,
            media_type=content_type,
            headers=headers,
        )

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
    }
    return StreamingResponse(
        storage_provider.iter_file_range(asset.storage_key, 0, file_size - 1),
        status_code=200,
        media_type=content_type,
        headers=headers,
    )


@app.post("/api/analyze/async", status_code=202, response_model=AnalysisJobCreateResponse, dependencies=[Depends(rate_limit_analysis)])
async def start_async_analysis(
    payload: AnalyzeAssetRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Queues an asynchronous analysis job with:
    - Per-tenant daily token quota enforcement (429 + next-day renewal if exhausted)
    - Idempotency-Key deduplication against double-clicks/retries
    """
    idem_cached = reserve_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key)
    if idem_cached is not None:
        return AnalysisJobCreateResponse(**idem_cached)

    try:
        asset = (
            db.query(AudioAssetModel)
            .filter(AudioAssetModel.id == payload.assetId, AudioAssetModel.org_id == user.org_id)
            .first()
        )
        if not asset:
            raise HTTPException(status_code=404, detail="Audio asset not found.")

        config_dict = payload.config.model_dump()
        config_hash = compute_config_hash(config_dict)
        cache_key = f"{asset.sha256}_{config_hash}"

        # Instant Tier-2 Cache Return: Zero worker overhead or step reruns if already analyzed
        cached_data = get_cached_report(cache_key, org_id=user.org_id)
        if cached_data and cached_data.get("transcript"):
            cached_data["cached"] = True
            cached_data["assetId"] = asset.id
            cached_data["audioUrl"] = f"/api/assets/{asset.id}/stream"
            cached_report = AnalysisReport(**cached_data)

            job = AnalysisJobModel(
                id=str(uuid.uuid4()),
                org_id=user.org_id,
                asset_id=asset.id,
                audio_hash=asset.sha256,
                config_hash=config_hash,
                config_json=config_dict,
                status="COMPLETED",
                stage_message="Instant Tier-2 cache hit: loaded verified analysis report.",
                progress_pct=100,
                total_chunks=1,
                completed_chunks=1,
                result_json=cached_report.model_dump(),
            )
            db.add(job)
            db.commit()

            resp_body = {
                "jobId": job.id,
                "status": "COMPLETED",
                "cached": True,
                "report": cached_report,
            }
            complete_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key, resp_body, http_status=200)
            return AnalysisJobCreateResponse(**resp_body)

        # Enforce daily token quota on non-Tier-2-cached runs
        est_tokens = estimate_audio_tokens(asset.duration_seconds or 30.0)
        try:
            assert_org_daily_quota(db, user.org_id, estimated_tokens=est_tokens)
        except DailyQuotaExceededError as q_err:
            release_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key)
            return _quota_exceeded_response(q_err)

        job = AnalysisJobModel(
            id=str(uuid.uuid4()),
            org_id=user.org_id,
            asset_id=asset.id,
            audio_hash=asset.sha256,
            config_hash=config_hash,
            config_json=config_dict,
            status="QUEUED",
            stage_message="Queued for processing...",
            progress_pct=2,
            total_chunks=1,
            completed_chunks=0,
        )
        db.add(job)
        db.commit()

        resp_body = {"jobId": job.id, "status": "QUEUED", "cached": False}
        complete_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key, resp_body, http_status=202)
        asyncio.create_task(execute_analysis_job(job.id))

        return AnalysisJobCreateResponse(**resp_body)
    except HTTPException:
        release_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key)
        raise
    except Exception:
        release_idempotency(user.org_id, "POST", "/api/analyze/async", idempotency_key)
        raise


@app.post("/api/jobs/{job_id}/cancel")
def cancel_analysis_job_endpoint(
    job_id: str,
    user: AuthUser = Depends(get_current_user),
):
    """Cancels an active or queued analysis job and releases resources."""
    success = cancel_job(job_id, org_id=user.org_id)
    return {
        "jobId": job_id,
        "status": "CANCELLED" if success else "UNCHANGED",
        "cancelled": success,
        "message": "Analysis job stopped successfully." if success else "Job is already completed, failed, or not found.",
    }


@app.get("/api/jobs/{job_id}", response_model=AnalysisJobStatusResponse)
def get_job_status(
    job_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = (
        db.query(AnalysisJobModel)
        .filter(AnalysisJobModel.id == job_id, AnalysisJobModel.org_id == user.org_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    report_obj = AnalysisReport(**job.result_json) if job.result_json else None
    return AnalysisJobStatusResponse(
        jobId=job.id,
        assetId=job.asset_id,
        status=job.status,
        stageMessage=job.stage_message,
        progressPct=job.progress_pct,
        totalChunks=job.total_chunks,
        completedChunks=job.completed_chunks,
        callId=job.call_id,
        report=report_obj,
        errorMessage=job.error_message,
    )


@app.get("/api/jobs/{job_id}/events")
async def stream_job_events(
    job_id: str,
    request: Request,
    user: AuthUser = Depends(get_current_user),
):
    """Server-Sent Events (SSE) endpoint streaming live tenant-scoped job progress."""
    async def event_generator():
        last_signature = None
        while True:
            if await request.is_disconnected():
                break

            db = SessionLocal()
            try:
                job = (
                    db.query(AnalysisJobModel)
                    .filter(AnalysisJobModel.id == job_id, AnalysisJobModel.org_id == user.org_id)
                    .first()
                )
                if not job:
                    yield f"data: {json.dumps({'status': 'FAILED', 'errorMessage': 'Job not found'})}\n\n"
                    break

                payload = {
                    "jobId": job.id,
                    "assetId": job.asset_id,
                    "status": job.status,
                    "stageMessage": job.stage_message,
                    "progressPct": job.progress_pct,
                    "totalChunks": job.total_chunks,
                    "completedChunks": job.completed_chunks,
                    "callId": job.call_id,
                    "errorMessage": job.error_message,
                }
                if job.status == "COMPLETED" and job.result_json:
                    payload["report"] = job.result_json

                sig = (job.status, job.progress_pct, job.completed_chunks, job.stage_message)
                if sig != last_signature:
                    last_signature = sig
                    yield f"data: {json.dumps(payload)}\n\n"

                if job.status in ("COMPLETED", "FAILED", "CANCELLED"):
                    break
            finally:
                db.close()

            await asyncio.sleep(0.6)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/analyze", response_model=AnalysisReport, dependencies=[Depends(rate_limit_analysis)])
async def analyze_call(
    file: UploadFile = File(...),
    config: str = Form(...),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    filename = sanitize_filename(file.filename or "recording.m4a")
    if not any(filename.lower().endswith(ext) for ext in VALID_AUDIO_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Unsupported audio format.")

    try:
        config_dict = json.loads(config)
        parsed_config = AnalysisConfigInput(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid configuration parameters: {e}")

    suffix = os.path.splitext(filename)[1] or ".m4a"
    hasher = hashlib.sha256()
    total_bytes = 0
    leading = bytearray()

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_path = tmp_file.name
        while True:
            piece = await file.read(65536)
            if not piece:
                break
            total_bytes += len(piece)
            if total_bytes > MAX_UPLOAD_BYTES:
                tmp_file.close()
                os.remove(tmp_path)
                raise HTTPException(status_code=413, detail="File exceeds 500 MB limit.")
            if len(leading) < 64:
                leading.extend(piece[: 64 - len(leading)])
            hasher.update(piece)
            tmp_file.write(piece)

    is_valid, _ = validate_audio_magic_bytes(bytes(leading))
    if not is_valid:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=400, detail="Invalid audio signature (magic-byte check failed).")

    file_size_mb = f"{total_bytes / (1024 * 1024):.2f} MB"
    audio_hash = hasher.hexdigest()[:24]
    config_hash = compute_config_hash(config_dict)
    cache_key = f"{audio_hash}_{config_hash}"

    try:
        cached_data = get_cached_report(cache_key, org_id=user.org_id)
        if cached_data and cached_data.get("transcript"):
            cached_data["cached"] = True
            report = AnalysisReport(**cached_data)
            await asyncio.to_thread(persist_report_to_db, report, audio_hash, None, user.org_id, cache_key)
            return report

        try:
            assert_org_daily_quota(db, user.org_id)
        except DailyQuotaExceededError as q_err:
            return _quota_exceeded_response(q_err)

        audio_base = get_audio_base_cache(audio_hash, org_id=user.org_id)
        if audio_base and audio_base.get("transcript"):
            try:
                fast_report = await asyncio.to_thread(
                    reanalyze_from_transcript,
                    audio_base=audio_base,
                    filename=filename,
                    file_size_str=file_size_mb,
                    config=parsed_config,
                    org_id=user.org_id,
                )
                if fast_report.transcript:
                    save_cached_report(cache_key, fast_report.model_dump(), org_id=user.org_id)
                    await asyncio.to_thread(persist_report_to_db, fast_report, audio_hash, None, user.org_id, cache_key)
                return fast_report
            except Exception as tier1_err:
                print(f"[Tier-1 Fallback] Fast re-eval hit issue ({tier1_err}), falling back to full audio pipeline...")

        report = await asyncio.to_thread(
            analyze_call_with_ai,
            file_path=tmp_path,
            filename=filename,
            file_size_str=file_size_mb,
            config=parsed_config,
            org_id=user.org_id,
        )
        if report.transcript:
            save_audio_base_cache(
                audio_hash,
                {
                    "transcript": [seg.model_dump() for seg in report.transcript],
                    "duration": report.duration,
                    "callMetadata": report.callMetadata.model_dump() if report.callMetadata else None,
                },
                org_id=user.org_id,
            )
            save_cached_report(cache_key, report.model_dump(), org_id=user.org_id)
            await asyncio.to_thread(persist_report_to_db, report, audio_hash, None, user.org_id, cache_key)
        return report
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


# =============================================================================
# HISTORICAL CALL EXPLORER ENDPOINTS (KEYSET CURSOR + ZERO N+1)
# =============================================================================

def _is_postgresql(db: Session) -> bool:
    """Detects whether the active SQLAlchemy Session runs on PostgreSQL vs SQLite."""
    if db.bind is not None:
        return db.bind.dialect.name == "postgresql"
    return not DATABASE_URL.startswith("sqlite")


def _build_snippet(text: str, query_term: str, max_len: int = 140) -> str:
    clean_text = " ".join((text or "").split())
    if len(clean_text) <= max_len:
        return clean_text
    idx = clean_text.lower().find(query_term.lower())
    if idx == -1:
        return clean_text[: max_len - 3] + "..."
    start = max(0, idx - 40)
    end = min(len(clean_text), start + max_len)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(clean_text) else ""
    return f"{prefix}{clean_text[start:end]}{suffix}"


@app.get("/api/history", response_model=PaginatedHistoryResponse)
def get_call_history(
    search: Optional[str] = Query(None),
    tone: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tenant-scoped O(log N) keyset-paginated history with FTS transcript search."""
    query = db.query(CallAuditModel).filter(CallAuditModel.org_id == user.org_id)
    if tone and tone.upper() in ("GREEN", "RED"):
        query = query.filter(CallAuditModel.tone_rating == tone.upper())

    clean_search = search.strip() if search and search.strip() else None
    is_pg = _is_postgresql(db)
    if clean_search:
        term = f"%{clean_search}%"
        if is_pg:
            seg_match = sql_text(
                "to_tsvector('english', transcript_segments.text) @@ plainto_tsquery('english', :q)"
            ).bindparams(q=clean_search)
        else:
            seg_match = TranscriptSegmentModel.text.ilike(term)

        transcript_exists = exists().where(
            TranscriptSegmentModel.call_id == CallAuditModel.id,
            seg_match,
        )
        query = query.filter(
            (CallAuditModel.filename.ilike(term))
            | (CallAuditModel.headline.ilike(term))
            | (CallAuditModel.category.ilike(term))
            | transcript_exists
        )

    parsed_cursor = _parse_cursor(cursor)
    if parsed_cursor:
        c_dt, c_id = parsed_cursor
        query = query.filter(
            or_(
                CallAuditModel.created_at < c_dt,
                and_(CallAuditModel.created_at == c_dt, CallAuditModel.id < c_id),
            )
        )

    rows = (
        query.order_by(desc(CallAuditModel.created_at), desc(CallAuditModel.id))
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    snippet_by_call: dict[str, tuple[str, str, int]] = {}
    if clean_search and page_rows:
        call_ids = [a.id for a in page_rows]
        if is_pg:
            seg_filter = sql_text(
                "to_tsvector('english', transcript_segments.text) @@ plainto_tsquery('english', :q)"
            ).bindparams(q=clean_search)
        else:
            seg_filter = TranscriptSegmentModel.text.ilike(f"%{clean_search}%")
        matching_segs = (
            db.query(TranscriptSegmentModel)
            .filter(TranscriptSegmentModel.call_id.in_(call_ids), seg_filter)
            .order_by(TranscriptSegmentModel.seconds.asc())
            .all()
        )
        for seg in matching_segs:
            if seg.call_id not in snippet_by_call:
                snippet_by_call[seg.call_id] = (
                    _build_snippet(seg.text, clean_search),
                    seg.timestamp or "00:00",
                    int(seg.seconds or 0),
                )

    items = []
    for a in page_rows:
        snip = snippet_by_call.get(a.id)
        items.append(
            CallHistoryItem(
                id=a.id,
                filename=a.filename,
                fileSize=a.file_size or "0 MB",
                duration=a.duration or "00:00",
                overallScore=a.overall_score,
                toneRating=a.tone_rating,
                category=a.category or "General",
                headline=a.headline or "",
                commitmentsCount=a.commitments_count or 0,
                turnsCount=a.turns_count or 0,
                createdAt=a.created_at.strftime("%b %d, %Y %H:%M") if a.created_at else "",
                matchedSnippet=snip[0] if snip else None,
                matchedTimestamp=snip[1] if snip else None,
                matchedSeconds=snip[2] if snip else None,
            )
        )

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        if last.created_at:
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

    return PaginatedHistoryResponse(items=items, nextCursor=next_cursor, hasMore=has_more)


@app.get("/api/search/transcripts", response_model=PaginatedSearchResponse)
def search_transcripts(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(30, ge=1, le=100),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Full-text search across spoken transcript turns, strictly scoped to the caller's org."""
    clean_q = q.strip()
    if not clean_q:
        return PaginatedSearchResponse(items=[], hasMore=False)

    query = (
        db.query(TranscriptSegmentModel, CallAuditModel)
        .join(CallAuditModel, TranscriptSegmentModel.call_id == CallAuditModel.id)
        .filter(CallAuditModel.org_id == user.org_id)
    )
    if _is_postgresql(db):
        query = query.filter(
            sql_text(
                "to_tsvector('english', transcript_segments.text) @@ plainto_tsquery('english', :q)"
            ).bindparams(q=clean_q)
        )
    else:
        query = query.filter(TranscriptSegmentModel.text.ilike(f"%{clean_q}%"))

    rows = (
        query.order_by(desc(CallAuditModel.created_at), TranscriptSegmentModel.seconds.asc())
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    hits = [
        TranscriptSearchHit(
            callId=audit.id,
            segmentId=seg.id,
            filename=audit.filename,
            toneRating=audit.tone_rating,
            speaker=seg.speaker,
            timestamp=seg.timestamp or "00:00",
            seconds=int(seg.seconds or 0),
            text=_build_snippet(seg.text, clean_q, max_len=200),
            createdAt=audit.created_at.strftime("%b %d, %Y %H:%M") if audit.created_at else "",
        )
        for seg, audit in rows[:limit]
    ]
    return PaginatedSearchResponse(items=hits, hasMore=has_more)


@app.get("/api/history/{call_id}")
def get_historical_call_detail(
    call_id: str,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audit = (
        db.query(CallAuditModel)
        .filter(CallAuditModel.id == call_id, CallAuditModel.org_id == user.org_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Call audit record not found.")
    return audit.to_report_dict()


@app.patch("/api/history/{call_id}/transcript/{segment_id}")
def update_transcript_segment(
    call_id: str,
    segment_id: str,
    payload: TranscriptSegmentUpdateRequest,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persists human-in-the-loop transcript corrections and syncs Tier-1 cache."""
    audit = (
        db.query(CallAuditModel)
        .filter(CallAuditModel.id == call_id, CallAuditModel.org_id == user.org_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Call audit record not found.")

    seg = (
        db.query(TranscriptSegmentModel)
        .filter(TranscriptSegmentModel.id == segment_id, TranscriptSegmentModel.call_id == call_id)
        .first()
    )
    if not seg:
        raise HTTPException(status_code=404, detail="Transcript segment not found.")

    seg.text = payload.text.strip()
    seg.speaker = payload.speaker.strip()
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="TRANSCRIPT_EDITED",
        target_id=call_id,
        metadata={"segmentId": segment_id, "speaker": seg.speaker},
    )
    db.commit()
    db.refresh(seg)

    if audit.audio_hash:
        cached_base = get_audio_base_cache(audit.audio_hash, org_id=user.org_id)
        if cached_base and isinstance(cached_base.get("transcript"), list):
            refreshed_segments = (
                db.query(TranscriptSegmentModel)
                .filter(TranscriptSegmentModel.call_id == call_id)
                .order_by(TranscriptSegmentModel.seconds.asc())
                .all()
            )
            cached_base["transcript"] = [s.to_dict() for s in refreshed_segments]
            save_audio_base_cache(audit.audio_hash, cached_base, org_id=user.org_id)

    return seg.to_dict()


@app.delete("/api/history/{call_id}")
def delete_historical_call(
    call_id: str,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    audit = (
        db.query(CallAuditModel)
        .filter(CallAuditModel.id == call_id, CallAuditModel.org_id == user.org_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Call record not found.")
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="CALL_DELETED",
        target_id=call_id,
        metadata={"filename": audit.filename},
    )
    db.delete(audit)
    db.commit()
    analytics_single_flight.invalidate(user.org_id)
    return {"status": "deleted", "callId": call_id}


# =============================================================================
# COMMITMENTS & ACTION ITEM TRACKING ENDPOINTS (KEYSET CURSOR)
# =============================================================================

@app.get("/api/commitments", response_model=PaginatedCommitmentsResponse)
def get_all_commitments(
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = db.query(CommitmentModel).filter(CommitmentModel.org_id == user.org_id)
    if status and status.upper() in ("PENDING", "IN_PROGRESS", "COMPLETED"):
        query = query.filter(CommitmentModel.status == status.upper())
    if owner:
        query = query.filter(CommitmentModel.owner.ilike(f"%{owner}%"))

    parsed_cursor = _parse_cursor(cursor)
    if parsed_cursor:
        c_dt, c_id = parsed_cursor
        query = query.filter(
            or_(
                CommitmentModel.created_at < c_dt,
                and_(CommitmentModel.created_at == c_dt, CommitmentModel.id < c_id),
            )
        )

    rows = (
        query.order_by(desc(CommitmentModel.created_at), desc(CommitmentModel.id))
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    page_rows = rows[:limit]

    next_cursor = None
    if has_more and page_rows:
        last = page_rows[-1]
        if last.created_at:
            next_cursor = f"{last.created_at.isoformat()}|{last.id}"

    return PaginatedCommitmentsResponse(
        items=[c.to_dict() for c in page_rows],
        nextCursor=next_cursor,
        hasMore=has_more,
    )


@app.patch("/api/commitments/{commitment_id}")
def update_commitment_status(
    commitment_id: str,
    payload: CommitmentStatusUpdate,
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comm = (
        db.query(CommitmentModel)
        .filter(CommitmentModel.id == commitment_id, CommitmentModel.org_id == user.org_id)
        .first()
    )
    if not comm:
        raise HTTPException(status_code=404, detail="Commitment not found.")
    comm.status = payload.status
    db.commit()
    analytics_single_flight.invalidate(user.org_id)
    return comm.to_dict()


# =============================================================================
# TEAM ANALYTICS & ESCALATION OVERVIEW ENDPOINTS (SQL AGGREGATIONS + SINGLE-FLIGHT)
# =============================================================================

@app.get("/api/analytics/overview", response_model=AnalyticsOverview)
def get_analytics_overview(user: AuthUser = Depends(get_current_user)):
    """Computes aggregated metrics directly in SQL with 30s single-flight stampede protection."""
    def _compute() -> AnalyticsOverview:
        db = SessionLocal()
        try:
            call_agg = (
                db.query(
                    func.count(CallAuditModel.id),
                    func.coalesce(func.avg(CallAuditModel.overall_score), 0.0),
                    func.coalesce(
                        func.sum(case((CallAuditModel.tone_rating == "RED", 1), else_=0)),
                        0,
                    ),
                )
                .filter(CallAuditModel.org_id == user.org_id)
                .first()
            )
            total_calls = int(call_agg[0] or 0) if call_agg else 0
            avg_score = round(float(call_agg[1] or 0.0), 2) if call_agg and total_calls > 0 else 0.0
            red_flags = int(call_agg[2] or 0) if call_agg else 0
            green_flags = max(0, total_calls - red_flags)
            escalation_rate = round((red_flags / total_calls) * 100.0, 1) if total_calls > 0 else 0.0

            comm_agg = (
                db.query(
                    func.count(CommitmentModel.id),
                    func.coalesce(
                        func.sum(case((CommitmentModel.status == "COMPLETED", 1), else_=0)),
                        0,
                    ),
                )
                .filter(CommitmentModel.org_id == user.org_id)
                .first()
            )
            total_comm = int(comm_agg[0] or 0) if comm_agg else 0
            completed_comm = int(comm_agg[1] or 0) if comm_agg else 0
            pending_comm = max(0, total_comm - completed_comm)
            completion_rate = round((completed_comm / total_comm) * 100.0, 1) if total_comm > 0 else 0.0

            return AnalyticsOverview(
                totalCalls=total_calls,
                averageScore=avg_score,
                redFlagCount=red_flags,
                greenFlagCount=green_flags,
                escalationRate=escalation_rate,
                totalCommitments=total_comm,
                completedCommitments=completed_comm,
                pendingCommitments=pending_comm,
                completionRate=completion_rate,
            )
        finally:
            db.close()

    return analytics_single_flight.get_or_compute(user.org_id, _compute)


@app.get("/api/analytics/insights", response_model=CoachingInsightsResponse)
def get_analytics_insights(
    user: AuthUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Computes tenant-scoped coaching insights directly from persisted CallAuditModel & CommitmentModel data."""
    total_calls = int(
        db.query(func.count(CallAuditModel.id))
        .filter(CallAuditModel.org_id == user.org_id)
        .scalar()
        or 0
    )
    if total_calls == 0:
        return CoachingInsightsResponse(totalCalls=0)

    # 1. Dimension averages & weakest dimension from sentiment_breakdown across recent calls
    recent_audits = (
        db.query(
            CallAuditModel.sentiment_breakdown,
            CallAuditModel.category,
            CallAuditModel.tone_rating,
        )
        .filter(CallAuditModel.org_id == user.org_id)
        .order_by(desc(CallAuditModel.created_at), desc(CallAuditModel.id))
        .limit(200)
        .all()
    )
    dim_sums: dict[str, float] = {}
    dim_counts: dict[str, int] = {}
    for breakdown, _cat, _tone in recent_audits:
        if isinstance(breakdown, dict):
            for key, val in breakdown.items():
                if isinstance(val, (int, float)) and not isinstance(val, bool):
                    dim_sums[key] = dim_sums.get(key, 0.0) + float(val)
                    dim_counts[key] = dim_counts.get(key, 0) + 1

    dimension_averages = {
        k: round(dim_sums[k] / dim_counts[k], 1)
        for k in sorted(dim_sums.keys())
        if dim_counts.get(k, 0) > 0
    }
    weakest_dim = None
    weakest_avg = 0.0
    rep_dims = {k: v for k, v in dimension_averages.items() if k != "customerFrustration"}
    target_dims = rep_dims if rep_dims else dimension_averages
    if target_dims:
        weakest_dim = min(target_dims, key=lambda k: target_dims[k])
        weakest_avg = target_dims[weakest_dim]

    # 2. Highest RED escalation category via SQL aggregation
    cat_rows = (
        db.query(
            CallAuditModel.category,
            func.count(CallAuditModel.id),
            func.coalesce(
                func.sum(case((CallAuditModel.tone_rating == "RED", 1), else_=0)),
                0,
            ),
        )
        .filter(CallAuditModel.org_id == user.org_id)
        .group_by(CallAuditModel.category)
        .all()
    )
    top_cat = None
    top_rate = 0.0
    best_red_count = 0
    for cat_name, cat_total, cat_reds in cat_rows:
        cat_total_i = int(cat_total or 0)
        cat_reds_i = int(cat_reds or 0)
        if cat_total_i > 0 and cat_reds_i > 0:
            rate = round((cat_reds_i / cat_total_i) * 100.0, 1)
            if rate > top_rate or (rate == top_rate and cat_reds_i > best_red_count):
                top_rate = rate
                top_cat = cat_name or "General Call"
                best_red_count = cat_reds_i

    # 3. Latest RED evidence quote
    latest_red = (
        db.query(CallAuditModel)
        .filter(CallAuditModel.org_id == user.org_id, CallAuditModel.tone_rating == "RED")
        .order_by(desc(CallAuditModel.created_at), desc(CallAuditModel.id))
        .first()
    )
    latest_red_quote = None
    if latest_red:
        quote_text = ""
        quotes = latest_red.evidence_quotes if isinstance(latest_red.evidence_quotes, list) else []
        for q in quotes:
            if isinstance(q, str) and q.strip():
                quote_text = q.strip()
                break
            if isinstance(q, dict):
                cand = q.get("quote") or q.get("text") or ""
                if isinstance(cand, str) and cand.strip():
                    quote_text = cand.strip()
                    break
        if not quote_text:
            quote_text = (latest_red.headline or latest_red.explanation or "").strip()
        if quote_text:
            latest_red_quote = {
                "callId": latest_red.id,
                "filename": latest_red.filename,
                "quote": quote_text,
                "createdAt": latest_red.created_at.strftime("%b %d, %Y %H:%M") if latest_red.created_at else "",
            }

    # 4. Commitment deadline grounding rate
    comm_deadlines = (
        db.query(CommitmentModel.deadline)
        .filter(CommitmentModel.org_id == user.org_id)
        .all()
    )
    total_comms = len(comm_deadlines)
    if total_comms > 0:
        ungrounded = {"", "not specified", "none", "n/a", "unspecified", "unknown"}
        grounded_count = sum(
            1 for (d,) in comm_deadlines if d and str(d).strip().lower() not in ungrounded
        )
        deadline_grounding_pct = round((grounded_count / total_comms) * 100.0, 1)
    else:
        deadline_grounding_pct = 0.0

    return CoachingInsightsResponse(
        totalCalls=total_calls,
        weakestDimension=weakest_dim,
        weakestDimensionAvg=weakest_avg,
        dimensionAverages=dimension_averages,
        topEscalationCategory=top_cat,
        topEscalationRate=top_rate,
        latestRedQuote=latest_red_quote,
        deadlineGroundingPct=deadline_grounding_pct,
    )


# =============================================================================
# ADMIN WORKSPACE: MEMBERS, AUDIT LOGS & OUTBOUND WEBHOOKS
# =============================================================================

@app.get("/api/org/members", response_model=list[OrgMemberItem])
def list_org_members(
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    members = (
        db.query(UserModel)
        .filter(UserModel.org_id == user.org_id)
        .order_by(UserModel.created_at.asc())
        .all()
    )
    return [
        OrgMemberItem(
            userId=m.id,
            email=m.email,
            fullName=m.full_name or "",
            role=m.role if m.role in ("ADMIN", "MEMBER") else "MEMBER",
            createdAt=m.created_at.strftime("%b %d, %Y %H:%M") if m.created_at else "",
        )
        for m in members
    ]


@app.post("/api/org/members", response_model=OrgMemberItem, status_code=201)
def create_org_member(
    payload: CreateMemberRequest,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    normalized_email = payload.email.strip().lower()
    if db.query(UserModel).filter(UserModel.email == normalized_email).first():
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    new_member = UserModel(
        email=normalized_email,
        password_hash=hash_password(payload.password),
        full_name=payload.fullName.strip(),
        org_id=user.org_id,
        role=payload.role,
    )
    db.add(new_member)
    db.flush()
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="MEMBER_CREATED",
        target_id=new_member.id,
        metadata={"email": normalized_email, "role": payload.role},
    )
    db.commit()
    db.refresh(new_member)
    return OrgMemberItem(
        userId=new_member.id,
        email=new_member.email,
        fullName=new_member.full_name or "",
        role=new_member.role,
        createdAt=new_member.created_at.strftime("%b %d, %Y %H:%M") if new_member.created_at else "",
    )


@app.patch("/api/org/members/{member_id}/role", response_model=OrgMemberItem)
def update_org_member_role(
    member_id: str,
    payload: UpdateMemberRoleRequest,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = (
        db.query(UserModel)
        .filter(UserModel.id == member_id, UserModel.org_id == user.org_id)
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="Organization member not found.")

    if target.id == user.user_id and payload.role != "ADMIN":
        admin_count = (
            db.query(func.count(UserModel.id))
            .filter(UserModel.org_id == user.org_id, UserModel.role == "ADMIN")
            .scalar()
            or 0
        )
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Cannot demote the last workspace administrator.",
            )

    old_role = target.role
    target.role = payload.role
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="MEMBER_ROLE_UPDATED",
        target_id=target.id,
        metadata={"email": target.email, "previousRole": old_role, "role": payload.role},
    )
    db.commit()
    db.refresh(target)
    return OrgMemberItem(
        userId=target.id,
        email=target.email,
        fullName=target.full_name or "",
        role=target.role,
        createdAt=target.created_at.strftime("%b %d, %Y %H:%M") if target.created_at else "",
    )


@app.get("/api/org/audit-logs", response_model=PaginatedAuditLogsResponse)
def list_org_audit_logs(
    cursor: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(AuditLogModel).filter(AuditLogModel.org_id == user.org_id)
    parsed_cursor = _parse_cursor(cursor)
    if parsed_cursor:
        c_dt, c_id = parsed_cursor
        query = query.filter(
            or_(
                AuditLogModel.created_at < c_dt,
                and_(AuditLogModel.created_at == c_dt, AuditLogModel.id < c_id),
            )
        )

    rows = (
        query.order_by(desc(AuditLogModel.created_at), desc(AuditLogModel.id))
        .limit(limit + 1)
        .all()
    )
    has_more = len(rows) > limit
    page_rows = rows[:limit]
    items = [
        AuditLogItem(
            id=row.id,
            actorEmail=row.actor_email,
            action=row.action,
            targetId=row.target_id,
            metadata=row.metadata_json or {},
            createdAt=row.created_at.strftime("%b %d, %Y %H:%M:%S") if row.created_at else "",
        )
        for row in page_rows
    ]
    next_cursor = None
    if has_more and page_rows and page_rows[-1].created_at:
        next_cursor = f"{page_rows[-1].created_at.isoformat()}|{page_rows[-1].id}"
    return PaginatedAuditLogsResponse(items=items, nextCursor=next_cursor, hasMore=has_more)


def _webhook_to_item(w: WebhookEndpointModel) -> WebhookEndpointItem:
    tail = w.secret[-4:] if w.secret and len(w.secret) >= 4 else "****"
    return WebhookEndpointItem(
        id=w.id,
        url=w.url,
        events=list(w.events_json or []),
        isActive=bool(w.is_active),
        secretPreview=f"whsec_...{tail}",
        createdAt=w.created_at.strftime("%b %d, %Y %H:%M") if w.created_at else "",
    )


@app.get("/api/org/webhooks", response_model=list[WebhookEndpointItem])
def list_org_webhooks(
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    endpoints = (
        db.query(WebhookEndpointModel)
        .filter(WebhookEndpointModel.org_id == user.org_id)
        .order_by(desc(WebhookEndpointModel.created_at))
        .all()
    )
    return [_webhook_to_item(w) for w in endpoints]


@app.post("/api/org/webhooks", response_model=WebhookEndpointItem, status_code=201)
def create_org_webhook(
    payload: WebhookCreateRequest,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        safe_url = validate_webhook_url(payload.url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    secret = f"whsec_{secrets.token_hex(24)}"
    endpoint = WebhookEndpointModel(
        org_id=user.org_id,
        url=safe_url,
        secret=secret,
        events_json=list(payload.events),
        is_active=True,
    )
    db.add(endpoint)
    db.flush()
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="WEBHOOK_CREATED",
        target_id=endpoint.id,
        metadata={"url": safe_url, "events": list(payload.events)},
    )
    db.commit()
    db.refresh(endpoint)
    return _webhook_to_item(endpoint)


@app.delete("/api/org/webhooks/{webhook_id}")
def delete_org_webhook(
    webhook_id: str,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    endpoint = (
        db.query(WebhookEndpointModel)
        .filter(WebhookEndpointModel.id == webhook_id, WebhookEndpointModel.org_id == user.org_id)
        .first()
    )
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found.")

    url_snapshot = endpoint.url
    db.query(WebhookDeliveryModel).filter(
        WebhookDeliveryModel.endpoint_id == webhook_id,
        WebhookDeliveryModel.org_id == user.org_id,
    ).delete(synchronize_session=False)
    db.delete(endpoint)
    record_audit_log(
        db,
        org_id=user.org_id,
        actor_user_id=user.user_id,
        actor_email=user.email,
        action="WEBHOOK_DELETED",
        target_id=webhook_id,
        metadata={"url": url_snapshot},
    )
    db.commit()
    return {"status": "deleted", "webhookId": webhook_id}


@app.get("/api/org/webhooks/{webhook_id}/deliveries", response_model=list[WebhookDeliveryItem])
def list_webhook_deliveries(
    webhook_id: str,
    user: AuthUser = Depends(require_admin),
    db: Session = Depends(get_db),
):
    endpoint = (
        db.query(WebhookEndpointModel)
        .filter(WebhookEndpointModel.id == webhook_id, WebhookEndpointModel.org_id == user.org_id)
        .first()
    )
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found.")

    deliveries = (
        db.query(WebhookDeliveryModel)
        .filter(
            WebhookDeliveryModel.endpoint_id == webhook_id,
            WebhookDeliveryModel.org_id == user.org_id,
        )
        .order_by(desc(WebhookDeliveryModel.created_at))
        .limit(50)
        .all()
    )
    return [
        WebhookDeliveryItem(
            id=d.id,
            endpointId=d.endpoint_id,
            eventType=d.event_type,
            status=d.status,
            attempts=d.attempts,
            lastError=d.last_error,
            createdAt=d.created_at.strftime("%b %d, %Y %H:%M:%S") if d.created_at else "",
        )
        for d in deliveries
    ]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
