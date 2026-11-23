from typing import List, Optional, Literal
from pydantic import BaseModel, Field

SensitivityLevel = Literal['low', 'balanced', 'strict']
ActionItemScope = Literal['explicit_commitments', 'all_followups', 'strict_deadlines_only']
BusinessPresetId = Literal['saas_sales', 'debt_collection', 'real_estate', 'custom']

class AnalysisConfigInput(BaseModel):
    presetId: BusinessPresetId = 'saas_sales'
    presetName: str = 'B2B SaaS Sales'
    sensitivity: SensitivityLevel = 'balanced'
    toneCriteria: str = Field(
        default="Representative must maintain active listening, consultative empathy, and respect during pricing or technical objections."
    )
    actionItemScope: ActionItemScope = 'explicit_commitments'
    customForbiddenPhrases: List[str] = Field(default_factory=list)
    repSpeakerId: Literal['auto', 'Speaker 0', 'Speaker 1'] = 'auto'
    aiProvider: Literal['gemini', 'groq'] = 'gemini'

class EvidenceQuote(BaseModel):
    quote: str
    speaker: str
    explanation: str
    timestamp: Optional[str] = None

class SentimentBreakdown(BaseModel):
    repProfessionalism: int = Field(ge=0, le=100)
    repEmpathy: int = Field(ge=0, le=100)
    repPatience: int = Field(ge=0, le=100)
    customerFrustration: int = Field(ge=0, le=100)

class ToneAnalysisResult(BaseModel):
    rating: Literal['GREEN', 'RED']
    headline: str
    explanation: str
    evidenceQuotes: List[EvidenceQuote]
    confidenceScore: int = Field(ge=0, le=100)
    sentimentBreakdown: SentimentBreakdown

class ActionItem(BaseModel):
    id: str
    task: str
    owner: str  # "Sales Rep" | "Customer" | "Unspecified"
    deadline: Optional[str] = None
    evidenceQuote: str
    timestamp: Optional[str] = None
    seconds: Optional[int] = None
    confidence: int = Field(ge=0, le=100)

class TranscriptSegment(BaseModel):
    id: str
    speaker: str
    isRep: bool
    timestamp: str
    seconds: int
    text: str
    isFlaggedEvidence: Optional[bool] = False

class AnalysisReport(BaseModel):
    callId: str
    fileName: str
    fileSize: str
    duration: str
    uploadedAt: str
    status: Literal['processing', 'completed', 'error']
    tone: ToneAnalysisResult
    actionItems: List[ActionItem]
    transcript: List[TranscriptSegment]
    configUsed: AnalysisConfigInput
    cached: Optional[bool] = False
    errorMessage: Optional[str] = None
