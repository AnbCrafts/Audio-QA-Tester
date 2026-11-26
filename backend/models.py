import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    Float,
    Integer,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.orm import relationship
from database import Base


def utcnow_naive() -> datetime:
    """Returns naive UTC datetime compatible with existing TIMESTAMP columns without 3.14 warnings."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class OrganizationModel(Base):
    """Tenant workspace with configurable daily token quota."""
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    daily_token_limit = Column(Integer, default=500_000, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)


class UserModel(Base):
    """Authenticated user belonging to an OrganizationModel tenant."""
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, default="")
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=False)
    role = Column(String, default="MEMBER", nullable=False)  # "ADMIN" | "MEMBER"
    created_at = Column(DateTime, default=utcnow_naive)

    organization = relationship("OrganizationModel")


class CallAuditModel(Base):
    """Stores high-level call evaluation results and metadata."""
    __tablename__ = "call_audits"
    __table_args__ = (
        Index("ix_call_audits_org_created_id", "org_id", "created_at", "id"),
        Index("ix_call_audits_org_tone_created", "org_id", "tone_rating", "created_at", "id"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    filename = Column(String, nullable=False)
    file_size = Column(String, default="0 MB")
    duration = Column(String, default="00:00")
    overall_score = Column(Float, nullable=False)
    tone_rating = Column(String, nullable=False)  # "GREEN" or "RED"
    headline = Column(String, default="")
    explanation = Column(Text, default="")
    confidence_score = Column(Integer, default=90)
    sentiment_breakdown = Column(JSON, default=dict)
    category = Column(String, default="General Call")
    category_confidence = Column(Integer, default=90)
    domain_summary = Column(Text, default="")
    greeting_observed = Column(Boolean, default=True)
    polite_language_observed = Column(Boolean, default=True)
    professional_closing_observed = Column(Boolean, default=True)
    etiquette_notes = Column(JSON, default=list)
    evidence_quotes = Column(JSON, default=list)
    audio_hash = Column(String, index=True, nullable=True)
    cache_key = Column(String, index=True, nullable=True)
    turns_count = Column(Integer, default=0, nullable=False)
    commitments_count = Column(Integer, default=0, nullable=False)
    asset_id = Column(String, ForeignKey("audio_assets.id"), index=True, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)

    # Relationships
    asset = relationship("AudioAssetModel")
    transcripts = relationship(
        "TranscriptSegmentModel",
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="TranscriptSegmentModel.seconds",
    )
    commitments = relationship(
        "CommitmentModel",
        back_populates="call",
        cascade="all, delete-orphan",
        order_by="CommitmentModel.seconds",
    )

    def to_report_dict(self):
        """Converts database model back into the full AnalysisReport schema format."""
        return {
            "callId": self.id,
            "assetId": self.asset_id,
            "audioUrl": f"/api/assets/{self.asset_id}/stream" if self.asset_id else None,
            "fileName": self.filename,
            "fileSize": self.file_size,
            "duration": self.duration,
            "overallScore": self.overall_score,
            "tone": {
                "rating": self.tone_rating,
                "headline": self.headline,
                "explanation": self.explanation,
                "confidenceScore": self.confidence_score,
                "sentimentBreakdown": self.sentiment_breakdown or {},
                "evidenceQuotes": self.evidence_quotes or [],
            },
            "actionItems": [c.to_dict() for c in self.commitments],
            "transcript": [t.to_dict() for t in self.transcripts],
            "callMetadata": {
                "detectedCategory": self.category,
                "categoryConfidence": self.category_confidence,
                "domainSummary": self.domain_summary,
                "greetingObserved": self.greeting_observed,
                "politeLanguageObserved": self.polite_language_observed,
                "professionalClosingObserved": self.professional_closing_observed,
                "etiquetteNotes": self.etiquette_notes or [],
            },
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class TranscriptSegmentModel(Base):
    """Stores individual speaker turns of the dialogue."""
    __tablename__ = "transcript_segments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = Column(String, ForeignKey("call_audits.id"), nullable=False, index=True)
    speaker = Column(String, nullable=False)
    is_rep = Column(Boolean, default=False)
    timestamp = Column(String, default="00:00")
    seconds = Column(Integer, default=0)
    text = Column(Text, nullable=False)
    is_flagged_evidence = Column(Boolean, default=False)

    call = relationship("CallAuditModel", back_populates="transcripts")

    def to_dict(self):
        return {
            "id": self.id,
            "speaker": self.speaker,
            "isRep": self.is_rep,
            "timestamp": self.timestamp,
            "seconds": self.seconds,
            "text": self.text,
            "isFlaggedEvidence": self.is_flagged_evidence,
        }


class CommitmentModel(Base):
    """Stores actionable follow-up commitments extracted from calls."""
    __tablename__ = "commitments"
    __table_args__ = (
        Index("ix_commitments_org_created_id", "org_id", "created_at", "id"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    call_id = Column(String, ForeignKey("call_audits.id"), nullable=False, index=True)
    task = Column(Text, nullable=False)
    owner = Column(String, nullable=False)
    deadline = Column(String, nullable=True)
    evidence_quote = Column(Text, default="")
    timestamp = Column(String, default="00:00")
    seconds = Column(Integer, default=0)
    confidence = Column(Integer, default=90)
    status = Column(String, default="PENDING")  # "PENDING" | "IN_PROGRESS" | "COMPLETED"
    created_at = Column(DateTime, default=utcnow_naive)

    call = relationship("CallAuditModel", back_populates="commitments")

    def to_dict(self):
        return {
            "id": self.id,
            "callId": self.call_id,
            "task": self.task,
            "owner": self.owner,
            "deadline": self.deadline,
            "evidenceQuote": self.evidence_quote,
            "timestamp": self.timestamp,
            "seconds": self.seconds,
            "confidence": self.confidence,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AudioAssetModel(Base):
    """Stores persistent audio file metadata & storage keys (no raw blobs in DB)."""
    __tablename__ = "audio_assets"
    __table_args__ = (Index("ix_audio_assets_org_sha256", "org_id", "sha256"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    sha256 = Column(String, index=True, nullable=False)
    original_filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    detected_format = Column(String, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    duration_seconds = Column(Float, default=0.0)
    storage_key = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)


class UploadSessionModel(Base):
    """Tracks resumable 5 MB chunked upload sessions."""
    __tablename__ = "upload_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    filename = Column(String, nullable=False)
    mime_type = Column(String, nullable=False)
    total_size_bytes = Column(Integer, nullable=False)
    total_chunks = Column(Integer, nullable=False)
    received_chunks = Column(JSON, default=list)
    sha256 = Column(String, index=True, nullable=False)
    status = Column(String, default="UPLOADING")  # "UPLOADING" | "COMPLETED" | "EXPIRED"
    asset_id = Column(String, ForeignKey("audio_assets.id"), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)


class AnalysisJobModel(Base):
    """Tracks asynchronous audio analysis jobs & live SSE progress."""
    __tablename__ = "analysis_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    asset_id = Column(String, ForeignKey("audio_assets.id"), nullable=False, index=True)
    audio_hash = Column(String, index=True, nullable=False)
    config_hash = Column(String, index=True, nullable=False)
    config_json = Column(JSON, default=dict)
    status = Column(String, default="QUEUED", index=True)
    stage_message = Column(String, default="Queued for processing...")
    progress_pct = Column(Integer, default=0)
    total_chunks = Column(Integer, default=1)
    completed_chunks = Column(Integer, default=0)
    call_id = Column(String, nullable=True)
    result_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow_naive)
    updated_at = Column(DateTime, default=utcnow_naive, onupdate=utcnow_naive)


class AudioChunkResultModel(Base):
    """Persists per-chunk Gemini transcription/notes for fault-tolerant resumption."""
    __tablename__ = "audio_chunk_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=True, default="default-org")
    job_id = Column(String, ForeignKey("analysis_jobs.id"), nullable=False, index=True)
    audio_hash = Column(String, index=True, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    start_seconds = Column(Float, default=0.0)
    end_seconds = Column(Float, default=0.0)
    transcript_json = Column(JSON, default=list)
    acoustic_notes = Column(Text, default="")
    status = Column(String, default="PENDING")  # "PENDING" | "COMPLETED" | "FAILED"
    created_at = Column(DateTime, default=utcnow_naive)


class IdempotencyRecordModel(Base):
    """Prevents duplicate job creation on client retries / double clicks."""
    __tablename__ = "idempotency_records"

    id = Column(String, primary_key=True)  # f"{org_id}:{method}:{path}:{key}"
    org_id = Column(String, index=True, nullable=False)
    status = Column(String, default="IN_PROGRESS")  # "IN_PROGRESS" | "COMPLETED"
    http_status = Column(Integer, default=202)
    response_json = Column(JSON, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow_naive)


class CacheEntryModel(Base):
    """Shared DB-backed Tier-1 & Tier-2 cache with TTL & LRU tracking."""
    __tablename__ = "cache_entries"

    cache_key = Column(String, primary_key=True)
    org_id = Column(String, index=True, nullable=False, default="default-org")
    tier = Column(String, nullable=False, index=True)  # "TIER1_AUDIO" | "TIER2_REPORT"
    payload_json = Column(JSON, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
    last_accessed_at = Column(DateTime, default=utcnow_naive, index=True)
    created_at = Column(DateTime, default=utcnow_naive)


class TokenUsageLedgerModel(Base):
    """Tracks per-tenant token consumption & estimated USD spend."""
    __tablename__ = "token_usage_ledger"
    __table_args__ = (
        Index("ix_token_ledger_org_created", "org_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    org_id = Column(String, ForeignKey("organizations.id"), index=True, nullable=False, default="default-org")
    job_id = Column(String, index=True, nullable=True)
    call_id = Column(String, index=True, nullable=True)
    provider = Column(String, nullable=False)  # "gemini" | "groq"
    model = Column(String, nullable=False)
    stage = Column(String, nullable=False)     # "single_pass" | "chunk_map" | "reduce" | "tier1_reeval" | "groq_stt"
    input_tokens = Column(Integer, default=0, nullable=False)
    output_tokens = Column(Integer, default=0, nullable=False)
    cached_tokens = Column(Integer, default=0, nullable=False)
    total_tokens = Column(Integer, default=0, nullable=False)
    estimated_cost_usd = Column(Float, default=0.0, nullable=False)
    created_at = Column(DateTime, default=utcnow_naive)
