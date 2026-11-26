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
    callId: Optional[str] = None
    task: str
    owner: str  # "Sales Rep" | "Customer" | "Unspecified"
    deadline: Optional[str] = None
    evidenceQuote: str
    timestamp: Optional[str] = None
    seconds: Optional[int] = None
    confidence: int = Field(ge=0, le=100)
    status: Optional[Literal['PENDING', 'IN_PROGRESS', 'COMPLETED']] = 'PENDING'

class TranscriptSegment(BaseModel):
    id: str
    speaker: str
    isRep: bool
    timestamp: str
    seconds: int
    text: str
    isFlaggedEvidence: Optional[bool] = False

class CallMetadata(BaseModel):
    detectedCategory: str = "General Business Call"
    categoryConfidence: int = Field(default=90, ge=0, le=100)
    domainSummary: Optional[str] = None
    greetingObserved: bool = True
    politeLanguageObserved: bool = True
    professionalClosingObserved: bool = True
    etiquetteNotes: List[str] = Field(default_factory=list)

class AnalysisReport(BaseModel):
    callId: str
    assetId: Optional[str] = None
    audioUrl: Optional[str] = None
    fileName: str
    fileSize: str
    duration: str
    uploadedAt: str
    status: Literal['processing', 'completed', 'error']
    tone: ToneAnalysisResult
    actionItems: List[ActionItem]
    transcript: List[TranscriptSegment]
    configUsed: AnalysisConfigInput
    callMetadata: Optional[CallMetadata] = None
    cached: Optional[bool] = False
    engineUsed: Optional[str] = "Gemini Flash"
    errorMessage: Optional[str] = None


class UploadInitRequest(BaseModel):
    filename: str
    mimeType: str = "audio/mp4"
    sizeBytes: int = Field(gt=0)
    sha256: str = Field(min_length=16, max_length=128)


class UploadInitResponse(BaseModel):
    deduplicated: bool
    uploadId: Optional[str] = None
    assetId: Optional[str] = None
    chunkSizeBytes: int
    totalChunks: int
    receivedChunks: List[int] = Field(default_factory=list)
    durationSeconds: Optional[float] = None


class UploadCompleteResponse(BaseModel):
    assetId: str
    sha256: str
    sizeBytes: int
    durationSeconds: float
    detectedFormat: str
    audioUrl: str


class AnalyzeAssetRequest(BaseModel):
    assetId: str
    config: AnalysisConfigInput


class AnalysisJobCreateResponse(BaseModel):
    jobId: str
    status: str
    cached: bool = False
    report: Optional[AnalysisReport] = None


class AnalysisJobStatusResponse(BaseModel):
    jobId: str
    assetId: str
    status: str
    stageMessage: str
    progressPct: int
    totalChunks: int
    completedChunks: int
    callId: Optional[str] = None
    report: Optional[AnalysisReport] = None
    errorMessage: Optional[str] = None

class CallHistoryItem(BaseModel):
    id: str
    filename: str
    fileSize: str
    duration: str
    overallScore: float
    toneRating: Literal['GREEN', 'RED']
    category: str
    headline: str
    commitmentsCount: int
    turnsCount: int
    createdAt: str

class CommitmentStatusUpdate(BaseModel):
    status: Literal['PENDING', 'IN_PROGRESS', 'COMPLETED']

class AnalyticsOverview(BaseModel):
    totalCalls: int
    averageScore: float
    redFlagCount: int
    greenFlagCount: int
    escalationRate: float
    totalCommitments: int
    completedCommitments: int
    pendingCommitments: int
    completionRate: float
