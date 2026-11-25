import uuid
from datetime import datetime
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
)
from sqlalchemy.orm import relationship
from database import Base

class CallAuditModel(Base):
    """Stores high-level call evaluation results and metadata."""
    __tablename__ = "call_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
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
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
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

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    call_id = Column(String, ForeignKey("call_audits.id"), nullable=False, index=True)
    task = Column(Text, nullable=False)
    owner = Column(String, nullable=False)
    deadline = Column(String, nullable=True)
    evidence_quote = Column(Text, default="")
    timestamp = Column(String, default="00:00")
    seconds = Column(Integer, default=0)
    confidence = Column(Integer, default=90)
    status = Column(String, default="PENDING")  # "PENDING" | "IN_PROGRESS" | "COMPLETED"
    created_at = Column(DateTime, default=datetime.utcnow)

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
