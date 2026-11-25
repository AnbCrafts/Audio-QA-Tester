import os
import json
import shutil
import tempfile
import asyncio
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from sqlalchemy import desc

# Load environment variables
load_dotenv()

from database import engine, Base, get_db
from models import CallAuditModel, TranscriptSegmentModel, CommitmentModel
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    CallHistoryItem,
    CommitmentStatusUpdate,
    AnalyticsOverview,
    ActionItem,
)
from audio_service import analyze_call_with_ai, reanalyze_from_transcript
from cache_service import (
    compute_audio_hash,
    compute_config_hash,
    compute_cache_key,
    get_cached_report,
    save_cached_report,
    get_audio_base_cache,
    save_audio_base_cache,
)

# Automatically create tables on startup (works seamlessly on SQLite & PostgreSQL)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="ScaleWorks AI - Enterprise Call Quality Intelligence Platform",
    description="Backend API with SQLAlchemy DB persistence, Two-Tier Caching, and Dual-Engine AI analysis.",
    version="2.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

@app.post("/api/analyze", response_model=AnalysisReport)
async def analyze_call(
    file: UploadFile = File(...),
    config: str = Form(...),
    db: Session = Depends(get_db),
):
    # Validate file type (.m4a preferred)
    filename = file.filename or "recording.m4a"
    valid_exts = (".m4a", ".mp3", ".wav", ".ogg", ".aac")
    if not any(filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Please upload an .m4a audio file."
        )

    # Parse config JSON
    try:
        config_dict = json.loads(config)
        parsed_config = AnalysisConfigInput(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid configuration parameters: {e}")

    # Read uploaded file content into memory for caching and temporary persistence
    content = await file.read()
    file_size_mb = f"{len(content) / (1024 * 1024):.2f} MB"

    audio_hash = compute_audio_hash(content)
    config_hash = compute_config_hash(config_dict)
    cache_key = f"{audio_hash}_{config_hash}"

    # =========================================================================
    # Tier 2 Cache Check: Full report match (Instant 0ms retrieval)
    # =========================================================================
    cached_data = get_cached_report(cache_key)
    if cached_data and cached_data.get("transcript") and len(cached_data["transcript"]) > 0:
        print(f"[Tier-2 Cache Hit] Returning full cached analysis in 0ms for key: {cache_key}")
        cached_data["cached"] = True
        report = AnalysisReport(**cached_data)
        # Ensure it exists in DB
        _save_report_to_db(db, report, audio_hash=audio_hash)
        return report

    # =========================================================================
    # Tier 1 Cache Check: Audio base transcript exists! (~300ms fast re-eval)
    # =========================================================================
    audio_base = get_audio_base_cache(audio_hash)
    if audio_base and audio_base.get("transcript") and len(audio_base["transcript"]) > 0:
        print(f"[Tier-1 Audio Cache Hit] Found existing verified transcript for audio_{audio_hash}!")
        print(f"[Tier-1 Fast Reasoning] Re-evaluating tone against new config in ~300ms...")
        try:
            fast_report = await asyncio.to_thread(
                reanalyze_from_transcript,
                audio_base=audio_base,
                filename=filename,
                file_size_str=file_size_mb,
                config=parsed_config
            )
            if fast_report.transcript and len(fast_report.transcript) > 0:
                save_cached_report(cache_key, fast_report.model_dump())
                _save_report_to_db(db, fast_report, audio_hash=audio_hash)
            return fast_report
        except Exception as tier1_err:
            print(f"[Tier-1 Fallback] Fast re-eval hit issue ({tier1_err}), falling back to full audio pipeline...")

    # =========================================================================
    # Tier 1 Miss (Cold Run): Full Multimodal Audio Processing (~3.5s)
    # =========================================================================
    suffix = os.path.splitext(filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_path = tmp_file.name
        tmp_file.write(content)

    try:
        report = await asyncio.to_thread(
            analyze_call_with_ai,
            file_path=tmp_path,
            filename=filename,
            file_size_str=file_size_mb,
            config=parsed_config
        )
        if report.transcript and len(report.transcript) > 0:
            # 1. Save to Tier 1 Audio Base Cache
            save_audio_base_cache(audio_hash, {
                "transcript": [seg.model_dump() for seg in report.transcript],
                "duration": report.duration,
                "callMetadata": report.callMetadata.model_dump() if report.callMetadata else None
            })
            # 2. Save to Tier 2 Config Cache
            save_cached_report(cache_key, report.model_dump())
            # 3. Save to Database
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
