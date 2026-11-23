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
  task: string;
  owner: string; // "Sales Rep" | "Customer" | "Unspecified"
  deadline: string | null;
  evidenceQuote: string;
  confidence: number;
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

export interface AnalysisReport {
  callId: string;
  fileName: string;
  fileSize: string;
  duration: string;
  audioUrl?: string | null;
  uploadedAt: string;
  tone: ToneAnalysisResult;
  actionItems: ActionItem[];
  transcript: TranscriptSegment[];
  configUsed: AnalysisConfig;
  status: 'processing' | 'completed' | 'error';
  errorMessage?: string;
}
