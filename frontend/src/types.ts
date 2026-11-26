export type SensitivityLevel = 'low' | 'balanced' | 'strict';
export type ActionItemScope = 'explicit_commitments' | 'all_followups' | 'strict_deadlines_only';
export type BusinessPresetId = 'saas_sales' | 'debt_collection' | 'real_estate' | 'custom';

export interface BusinessPreset {
  id: BusinessPresetId;
  name: string;
  industry: string;
  description: string;
  defaultToneCriteria: string;
  defaultSensitivity: SensitivityLevel;
  defaultActionItemScope: ActionItemScope;
}

export interface AnalysisConfig {
  presetId: BusinessPresetId;
  presetName: string;
  sensitivity: SensitivityLevel;
  toneCriteria: string;
  actionItemScope: ActionItemScope;
  customForbiddenPhrases: string[];
  repSpeakerId: 'auto' | 'Speaker 0' | 'Speaker 1';
  aiProvider: 'gemini' | 'groq';
}

export interface TranscriptSegment {
  id: string;
  speaker: string; // "Sales Rep" | "Customer" | string
  isRep: boolean;
  timestamp: string; // e.g. "00:15"
  seconds: number;
  text: string;
  isFlaggedEvidence?: boolean;
}

export interface ActionItem {
  id: string;
  callId?: string;
  task: string;
  owner: string; // "Sales Rep" | "Customer" | "Unspecified"
  deadline: string | null;
  evidenceQuote: string;
  timestamp?: string | null;
  seconds?: number | null;
  confidence: number;
  status?: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

export interface CallHistoryItem {
  id: string;
  filename: string;
  fileSize: string;
  duration: string;
  overallScore: number;
  toneRating: 'GREEN' | 'RED';
  category: string;
  headline: string;
  commitmentsCount: number;
  turnsCount: number;
  createdAt: string;
}

export interface AnalyticsOverview {
  totalCalls: number;
  averageScore: number;
  redFlagCount: number;
  greenFlagCount: number;
  escalationRate: number;
  totalCommitments: number;
  completedCommitments: number;
  pendingCommitments: number;
  completionRate: number;
}

export interface EvidenceQuote {
  quote: string;
  speaker: string;
  explanation: string;
  timestamp?: string;
}

export interface ToneAnalysisResult {
  rating: 'GREEN' | 'RED';
  headline: string;
  explanation: string;
  evidenceQuotes: EvidenceQuote[];
  confidenceScore: number;
  sentimentBreakdown: {
    repProfessionalism: number; // 0-100
    repEmpathy: number; // 0-100
    repPatience: number; // 0-100
    customerFrustration: number; // 0-100 (isolated to prove contrast)
  };
}

export interface CallMetadata {
  detectedCategory: string;
  categoryConfidence: number;
  domainSummary?: string | null;
  greetingObserved: boolean;
  politeLanguageObserved: boolean;
  professionalClosingObserved: boolean;
  etiquetteNotes: string[];
}

export interface AnalysisReport {
  callId: string;
  assetId?: string | null;
  fileName: string;
  fileSize: string;
  duration: string;
  audioUrl?: string | null;
  uploadedAt: string;
  tone: ToneAnalysisResult;
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
  configUsed: AnalysisConfig;
  callMetadata?: CallMetadata;
  cached?: boolean;
  engineUsed?: string;
  status: 'processing' | 'completed' | 'error';
  errorMessage?: string;
}

export interface JobProgressEvent {
  jobId: string;
  assetId: string;
  status: string;
  stageMessage: string;
  progressPct: number;
  totalChunks: number;
  completedChunks: number;
  callId?: string | null;
  report?: AnalysisReport | null;
  errorMessage?: string | null;
}

export interface UserProfile {
  userId: string;
  email: string;
  fullName: string;
  orgId: string;
  orgName: string;
  role: 'ADMIN' | 'MEMBER';
}

export interface ModelUsageBreakdown {
  model: string;
  provider: string;
  requests: number;
  totalTokens: number;
  costUsd: number;
}

export interface OrgTokenQuota {
  orgId: string;
  orgName: string;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
  usagePct: number;
  isExhausted: boolean;
  renewsAtUtc: string;
  retryAfterSeconds: number;
  totalTokensAllTime: number;
  totalCostUsdAllTime: number;
  byModel: ModelUsageBreakdown[];
}
