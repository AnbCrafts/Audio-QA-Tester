import os
import re
import uuid
import json
import hashlib
import tempfile
import asyncio
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import desc

# Load environment variables
load_dotenv()

from database import engine, Base, get_db, run_schema_migrations, SessionLocal
from models import (
    CallAuditModel,
    TranscriptSegmentModel,
    CommitmentModel,
    AudioAssetModel,
    UploadSessionModel,
    AnalysisJobModel,
)
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    CallHistoryItem,
    CommitmentStatusUpdate,
    AnalyticsOverview,
    UploadInitRequest,
    UploadInitResponse,
    UploadCompleteResponse,
    AnalyzeAssetRequest,
    AnalysisJobCreateResponse,
    AnalysisJobStatusResponse,
)
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
from job_worker import execute_analysis_job
from cache_service import (
    compute_audio_hash,
    compute_config_hash,
    get_cached_report,
    save_cached_report,
    get_audio_base_cache,
    save_audio_base_cache,
)

# Automatically create new tables and run idempotent column migrations on startup
run_schema_migrations()

app = FastAPI(
    title="ScaleWorks AI - Enterprise Call Quality Intelligence Platform",
    description="Backend API with SQLAlchemy DB persistence, Chunked Resumable Uploads, Async Map-Reduce AI Pipeline, and Two-Tier Caching.",
    version="2.1.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def cleanup_stale_uploads_on_startup():
    """Removes expired temporary upload chunks older than TTL."""
    storage_provider.cleanup_stale_tmp()
    db = SessionLocal()
    try:
        now = datetime.utcnow()
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

def _save_report_to_db(db: Session, report: AnalysisReport, audio_hash: Optional[str] = None) -> str:
    """Persists an analysis report, its transcript turns, and extracted action items to the database."""
    try:
        # Calculate overall score for DB storage
        raw_score = 4.5
        if report.tone.rating == 'RED':
            raw_score = 2.4
        elif report.tone.sentimentBreakdown:
            p = report.tone.sentimentBreakdown.repProfessionalism
            e = report.tone.sentimentBreakdown.repEmpathy
            raw_score = round(((p + e) / 200.0) * 5.0, 1)

        category_name = "General Call"
        category_conf = 90
        domain_sum = ""
        etiquette_list = []
        greeting = True
        polite = True
        closing = True

        if report.callMetadata:
            category_name = report.callMetadata.detectedCategory or category_name
            category_conf = report.callMetadata.categoryConfidence or category_conf
            domain_sum = report.callMetadata.domainSummary or ""
            etiquette_list = report.callMetadata.etiquetteNotes or []
            greeting = report.callMetadata.greetingObserved
            polite = report.callMetadata.politeLanguageObserved
            closing = report.callMetadata.professionalClosingObserved

        audit = CallAuditModel(
            filename=report.fileName,
            file_size=report.fileSize,
            duration=report.duration,
            overall_score=raw_score,
            tone_rating=report.tone.rating,
            headline=report.tone.headline,
            explanation=report.tone.explanation,
            confidence_score=report.tone.confidenceScore,
            sentiment_breakdown=report.tone.sentimentBreakdown.model_dump() if report.tone.sentimentBreakdown else {},
            category=category_name,
            category_confidence=category_conf,
            domain_summary=domain_sum,
            greeting_observed=greeting,
            polite_language_observed=polite,
            professional_closing_observed=closing,
            etiquette_notes=etiquette_list,
            evidence_quotes=[eq.model_dump() for eq in report.tone.evidenceQuotes],
            audio_hash=audio_hash,
        )
        db.add(audit)
        db.flush()  # Generates audit.id

        # Insert transcript segments
        for seg in report.transcript:
            t_model = TranscriptSegmentModel(
                call_id=audit.id,
                speaker=seg.speaker,
                is_rep=seg.isRep,
                timestamp=seg.timestamp,
                seconds=seg.seconds,
                text=seg.text,
                is_flagged_evidence=seg.isFlaggedEvidence,
            )
            db.add(t_model)

        # Insert extracted commitments
        for act in report.actionItems:
            act.callId = audit.id
            c_model = CommitmentModel(
                call_id=audit.id,
                task=act.task,
                owner=act.owner,
                deadline=act.deadline,
                evidence_quote=act.evidenceQuote,
                timestamp=act.timestamp,
                seconds=act.seconds or 0,
                confidence=act.confidence,
                status=act.status or "PENDING",
            )
            db.add(c_model)

        db.commit()
        db.refresh(audit)
        report.callId = audit.id
        return audit.id
    except Exception as db_err:
        db.rollback()
        print(f"[Warning] Failed to persist audit to database: {db_err}")
        return report.callId

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
        "service": "ScaleWorks Call Quality Agent",
        "gemini_configured": bool(gemini_key),
        "groq_configured": bool(groq_key),
        "database_connected": db_ok,
    }

@app.delete("/api/cache")
def clear_cache():
    from cache_service import CACHE_DIR
    cleared_count = 0
    if os.path.exists(CACHE_DIR):
        for f in os.listdir(CACHE_DIR):
            if f.endswith(".json"):
                try:
                    os.remove(os.path.join(CACHE_DIR, f))
                    cleared_count += 1
                except OSError:
                    pass
    return {"status": "cache_cleared", "deleted_files": cleared_count}

# =============================================================================
# CHUNKED RESUMABLE UPLOAD, RANGE STREAMING & ASYNC JOB ENDPOINTS
# =============================================================================

@app.post("/api/uploads/init", response_model=UploadInitResponse)
def init_chunked_upload(payload: UploadInitRequest, db: Session = Depends(get_db)):
    """
    Initializes a 5 MB chunked resumable upload session after checking SHA-256 deduplication.
    If the exact audio bytes already exist in AudioAssetModel, returns deduplicated=True (0 bytes uploaded).
    """
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

    # 1. Deduplication check against existing verified AudioAssets
    existing_asset = db.query(AudioAssetModel).filter(AudioAssetModel.sha256 == audio_hash).first()
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

    # 2. Resume an incomplete active session for the same file if available
    now = datetime.utcnow()
    existing_sess = (
        db.query(UploadSessionModel)
        .filter(
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
    db: Session = Depends(get_db),
):
    """Receives a single <=5 MB chunk via streaming I/O and validates magic bytes on chunk 0."""
    session = db.query(UploadSessionModel).filter(UploadSessionModel.id == upload_id).first()
    if not session or session.status != "UPLOADING":
        raise HTTPException(status_code=404, detail="Upload session not found or inactive.")
    if session.expires_at < datetime.utcnow():
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
        is_valid, detected_fmt = validate_audio_magic_bytes(leading_bytes)
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
async def complete_chunked_upload(upload_id: str, db: Session = Depends(get_db)):
    """Assembles uploaded chunks, verifies SHA-256 & magic bytes, and registers AudioAssetModel."""
    session = db.query(UploadSessionModel).filter(UploadSessionModel.id == upload_id).first()
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
def stream_audio_asset(asset_id: str, request: Request, db: Session = Depends(get_db)):
    """
    Streams persisted audio with HTTP 206 Partial Content byte-range support so
    HTML5 <audio> scrubbing works reliably for 1-hour+ files even after page reloads.
    """
    asset = db.query(AudioAssetModel).filter(AudioAssetModel.id == asset_id).first()
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


@app.post("/api/analyze/async", status_code=202, response_model=AnalysisJobCreateResponse)
async def start_async_analysis(payload: AnalyzeAssetRequest, db: Session = Depends(get_db)):
    """
    Queues an asynchronous analysis job (returns 202 Accepted immediately).
    Supports both initial analysis and zero-reupload re-analysis via assetId.
    """
    asset = db.query(AudioAssetModel).filter(AudioAssetModel.id == payload.assetId).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Audio asset not found.")

    config_dict = payload.config.model_dump()
    config_hash = compute_config_hash(config_dict)
    job = AnalysisJobModel(
        id=str(uuid.uuid4()),
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

    asyncio.create_task(execute_analysis_job(job.id))

    return AnalysisJobCreateResponse(jobId=job.id, status="QUEUED", cached=False)


@app.get("/api/jobs/{job_id}", response_model=AnalysisJobStatusResponse)
def get_job_status(job_id: str, db: Session = Depends(get_db)):
    job = db.query(AnalysisJobModel).filter(AnalysisJobModel.id == job_id).first()
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
async def stream_job_events(job_id: str, request: Request):
    """Server-Sent Events (SSE) endpoint streaming live job stage & chunk progress."""
    async def event_generator():
        last_signature = None
        while True:
            if await request.is_disconnected():
                break

            db = SessionLocal()
            try:
                job = db.query(AnalysisJobModel).filter(AnalysisJobModel.id == job_id).first()
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

                if job.status in ("COMPLETED", "FAILED"):
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


@app.post("/api/analyze", response_model=AnalysisReport)
async def analyze_call(
    file: UploadFile = File(...),
    config: str = Form(...),
    db: Session = Depends(get_db),
):
    # Validate file type (.m4a preferred)
    filename = sanitize_filename(file.filename or "recording.m4a")
    if not any(filename.lower().endswith(ext) for ext in VALID_AUDIO_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Unsupported audio format. Please upload an .m4a audio file."
        )

    # Parse config JSON
    try:
        config_dict = json.loads(config)
        parsed_config = AnalysisConfigInput(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid configuration parameters: {e}")

    # Stream uploaded file to disk in 64 KB chunks (no whole-file RAM buffering!)
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
        # Tier 2 Cache Check
        cached_data = get_cached_report(cache_key)
        if cached_data and cached_data.get("transcript"):
            cached_data["cached"] = True
            report = AnalysisReport(**cached_data)
            _save_report_to_db(db, report, audio_hash=audio_hash)
            return report

        # Tier 1 Cache Check
        audio_base = get_audio_base_cache(audio_hash)
        if audio_base and audio_base.get("transcript"):
            try:
                fast_report = await asyncio.to_thread(
                    reanalyze_from_transcript,
                    audio_base=audio_base,
                    filename=filename,
                    file_size_str=file_size_mb,
                    config=parsed_config
                )
                if fast_report.transcript:
                    save_cached_report(cache_key, fast_report.model_dump())
                    _save_report_to_db(db, fast_report, audio_hash=audio_hash)
                return fast_report
            except Exception as tier1_err:
                print(f"[Tier-1 Fallback] Fast re-eval hit issue ({tier1_err}), falling back to full audio pipeline...")

        report = await asyncio.to_thread(
            analyze_call_with_ai,
            file_path=tmp_path,
            filename=filename,
            file_size_str=file_size_mb,
            config=parsed_config
        )
        if report.transcript:
            save_audio_base_cache(audio_hash, {
                "transcript": [seg.model_dump() for seg in report.transcript],
                "duration": report.duration,
                "callMetadata": report.callMetadata.model_dump() if report.callMetadata else None
            })
            save_cached_report(cache_key, report.model_dump())
            _save_report_to_db(db, report, audio_hash=audio_hash)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

# =============================================================================
# HISTORICAL CALL EXPLORER ENDPOINTS
# =============================================================================

@app.get("/api/history", response_model=List[CallHistoryItem])
def get_call_history(
    search: Optional[str] = Query(None),
    tone: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Returns past audited calls from the database with optional search and tone filter."""
    query = db.query(CallAuditModel)
    if tone and tone.upper() in ("GREEN", "RED"):
        query = query.filter(CallAuditModel.tone_rating == tone.upper())
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            (CallAuditModel.filename.ilike(term)) |
            (CallAuditModel.headline.ilike(term)) |
            (CallAuditModel.category.ilike(term))
        )
    
    audits = query.order_by(desc(CallAuditModel.created_at)).limit(limit).all()
    results = []
    for a in audits:
        results.append(CallHistoryItem(
            id=a.id,
            filename=a.filename,
            fileSize=a.file_size or "0 MB",
            duration=a.duration or "00:00",
            overallScore=a.overall_score,
            toneRating=a.tone_rating,
            category=a.category or "General",
            headline=a.headline or "",
            commitmentsCount=len(a.commitments),
            turnsCount=len(a.transcripts),
            createdAt=a.created_at.strftime("%b %d, %Y %H:%M") if a.created_at else "",
        ))
    return results

@app.get("/api/history/{call_id}")
def get_historical_call_detail(call_id: str, db: Session = Depends(get_db)):
    """Fetches the full analysis report and transcript turns for a specific past call."""
    audit = db.query(CallAuditModel).filter(CallAuditModel.id == call_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Call audit record not found.")
    return audit.to_report_dict()

@app.delete("/api/history/{call_id}")
def delete_historical_call(call_id: str, db: Session = Depends(get_db)):
    """Deletes an audit record and cascades to all its turns and action items."""
    audit = db.query(CallAuditModel).filter(CallAuditModel.id == call_id).first()
    if not audit:
        raise HTTPException(status_code=404, detail="Call record not found.")
    db.delete(audit)
    db.commit()
    return {"status": "deleted", "callId": call_id}

# =============================================================================
# COMMITMENTS & ACTION ITEM TRACKING ENDPOINTS
# =============================================================================

@app.get("/api/commitments")
def get_all_commitments(
    status: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Returns all extracted commitments across all calls with their lifecycle status."""
    query = db.query(CommitmentModel)
    if status and status.upper() in ("PENDING", "IN_PROGRESS", "COMPLETED"):
        query = query.filter(CommitmentModel.status == status.upper())
    if owner:
        query = query.filter(CommitmentModel.owner.ilike(f"%{owner}%"))
    
    commitments = query.order_by(desc(CommitmentModel.created_at)).all()
    return [c.to_dict() for c in commitments]

@app.patch("/api/commitments/{commitment_id}")
def update_commitment_status(
    commitment_id: str,
    payload: CommitmentStatusUpdate,
    db: Session = Depends(get_db),
):
    """Updates the status of a commitment (PENDING -> IN_PROGRESS -> COMPLETED)."""
    comm = db.query(CommitmentModel).filter(CommitmentModel.id == commitment_id).first()
    if not comm:
        raise HTTPException(status_code=404, detail="Commitment not found.")
    comm.status = payload.status
    db.commit()
    return comm.to_dict()

# =============================================================================
# TEAM ANALYTICS & ESCALATION OVERVIEW ENDPOINTS
# =============================================================================

@app.get("/api/analytics/overview", response_model=AnalyticsOverview)
def get_analytics_overview(db: Session = Depends(get_db)):
    """Computes aggregated quality metrics across all audited calls."""
    total_calls = db.query(CallAuditModel).count()
    if total_calls == 0:
        return AnalyticsOverview(
            totalCalls=0,
            averageScore=0.0,
            redFlagCount=0,
            greenFlagCount=0,
            escalationRate=0.0,
            totalCommitments=0,
            completedCommitments=0,
            pendingCommitments=0,
            completionRate=0.0,
        )

    red_flags = db.query(CallAuditModel).filter(CallAuditModel.tone_rating == "RED").count()
    green_flags = total_calls - red_flags
    escalation_rate = round((red_flags / total_calls) * 100.0, 1)

    audits = db.query(CallAuditModel).all()
    avg_score = round(sum(a.overall_score for a in audits) / total_calls, 2)

    total_comm = db.query(CommitmentModel).count()
    completed_comm = db.query(CommitmentModel).filter(CommitmentModel.status == "COMPLETED").count()
    pending_comm = total_comm - completed_comm
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
