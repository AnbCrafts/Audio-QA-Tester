import React from 'react';
import { AlertOctagon, CheckCircle2, ShieldCheck, Quote, HelpCircle, BarChart3, UserCheck, Compass, Sparkles, Check, X, MessageCircleHeart } from 'lucide-react';
import { ToneAnalysisResult, CallMetadata } from '../types';

interface ToneCardProps {
  tone: ToneAnalysisResult;
  callMetadata?: CallMetadata | null;
  onJumpToTimestamp?: (timestamp: string) => void;
}

export const ToneCard: React.FC<ToneCardProps> = ({ tone, callMetadata, onJumpToTimestamp }) => {
  const isGreen = tone.rating === 'GREEN';

  // Calculate weighted overall QA score (Professionalism 40%, Patience 35%, Empathy 25%)
  const qualityScore = Math.round(
    0.4 * tone.sentimentBreakdown.repProfessionalism +
    0.35 * tone.sentimentBreakdown.repPatience +
    0.25 * tone.sentimentBreakdown.repEmpathy
  );

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-6 backdrop-blur-md transition-all shadow-xl ${
        isGreen
          ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 via-slate-900/60 to-slate-900/90 shadow-emerald-500/5'
          : 'border-rose-500/40 bg-gradient-to-br from-rose-950/25 via-slate-900/60 to-slate-900/90 shadow-rose-500/10'
      }`}
    >
      {/* Top Banner / Verdict */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* Main Status Pill */}
          <div
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-black text-sm tracking-wide shadow-md ${
              isGreen
                ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                : 'bg-rose-500 text-white shadow-rose-500/30'
            }`}
          >
            {isGreen ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                <span>TONE VERDICT: GREEN (COMPLIANT)</span>
              </>
            ) : (
              <>
                <AlertOctagon className="h-5 w-5" />
                <span>TONE VERDICT: RED (VIOLATION)</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <UserCheck className="h-3.5 w-3.5 text-amber-400" />
            <span>Target: <strong>Sales Representative Only</strong></span>
          </div>
        </div>

        {/* Score & Threshold Meters */}
        <div className="flex items-center gap-3">
          {/* Overall Quality Score Meter */}
          <div className="flex items-center gap-2.5 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Overall Quality
              </div>
              <div className={`text-sm font-mono font-bold ${isGreen ? 'text-emerald-400' : 'text-rose-400'}`}>
                {qualityScore} / 100
              </div>
            </div>
            <div className="h-2 w-16 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${isGreen ? 'bg-emerald-400' : 'bg-rose-400'}`}
                style={{ width: `${qualityScore}%` }}
              />
            </div>
          </div>

          {/* Model Confidence */}
          <div className="flex items-center gap-2.5 bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Confidence
              </div>
              <div className="text-sm font-mono font-bold text-white">
                {tone.confidenceScore}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Analysis Body */}
      <div className="mt-5 space-y-4">
        {/* Auto-Detected Domain Banner */}
        {callMetadata && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-300 border border-indigo-500/20">
                <Compass className="h-3.5 w-3.5 text-indigo-400" />
                Auto-Detected Domain: <strong className="text-white">{callMetadata.detectedCategory}</strong>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                ({callMetadata.categoryConfidence}% match)
              </span>
            </div>
            {callMetadata.domainSummary && (
              <p className="text-[11px] text-slate-400 italic">
                "{callMetadata.domainSummary}"
              </p>
            )}
          </div>
        )}

        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            {tone.headline}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">
            {tone.explanation}
          </p>
        </div>

        {/* Multi-Dimensional Sentiment Isolation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
          <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-medium uppercase block">Professionalism</span>
            <span className="text-sm font-bold text-slate-200 font-mono">
              {tone.sentimentBreakdown.repProfessionalism}/100
            </span>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-medium uppercase block">Empathy Score</span>
            <span className="text-sm font-bold text-slate-200 font-mono">
              {tone.sentimentBreakdown.repEmpathy}/100
            </span>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
            <span className="text-[10px] text-slate-400 font-medium uppercase block">Patience / Composure</span>
            <span className="text-sm font-bold text-slate-200 font-mono">
              {tone.sentimentBreakdown.repPatience}/100
            </span>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-2.5 border border-slate-800">
            <span className="text-[10px] text-amber-400 font-medium uppercase block">Customer Friction</span>
            <span className="text-sm font-bold text-amber-300 font-mono">
              {tone.sentimentBreakdown.customerFrustration}/100
            </span>
          </div>
        </div>

        {/* Universal Politeness & Etiquette Checklist */}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <MessageCircleHeart className="h-3.5 w-3.5 text-amber-400" />
              Universal Politeness & Etiquette Checklist
            </h4>
            <span className="text-[11px] text-slate-500">
              Baseline Conduct Audit
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* 1. Polite Greeting */}
            <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
              callMetadata?.greetingObserved !== false
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
            }`}>
              {callMetadata?.greetingObserved !== false ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>Greeting & Politeness Opening</span>
            </div>

            {/* 2. Respectful Acknowledgments */}
            <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
              callMetadata?.politeLanguageObserved !== false
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
            }`}>
              {callMetadata?.politeLanguageObserved !== false ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>Active Courtesy & Affirmations</span>
            </div>

            {/* 3. Professional Closing */}
            <div className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-medium ${
              callMetadata?.professionalClosingObserved !== false
                ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-300'
                : 'border-rose-500/20 bg-rose-500/5 text-rose-300'
            }`}>
              {callMetadata?.professionalClosingObserved !== false ? (
                <Check className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <X className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>Professional Closing / Sign-off</span>
            </div>
          </div>

          {/* Notes if available */}
          {callMetadata?.etiquetteNotes && callMetadata.etiquetteNotes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-slate-900">
              {callMetadata.etiquetteNotes.map((note, idx) => (
                <span key={idx} className="rounded-md bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 border border-slate-800">
                  • {note}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Evidence Citations (Grounding) */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Quote className="h-3.5 w-3.5 text-amber-400" />
              Supporting Evidence Quotes (Grounded in Transcript)
            </h4>
            <span className="text-[11px] text-slate-500">
              {tone.evidenceQuotes.length} Verified Evidence Snippets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tone.evidenceQuotes.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-950/70 p-3.5 hover:border-slate-700 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
                    <span className="font-semibold text-amber-400">{item.speaker}</span>
                    {item.timestamp && (
                      <button
                        onClick={() => onJumpToTimestamp && onJumpToTimestamp(item.timestamp!)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white hover:bg-slate-700 cursor-pointer"
                        title="Click to seek transcript"
                      >
                        ⏱ {item.timestamp}
                      </button>
                    )}
                  </div>
                  <p className="text-xs italic text-slate-200 border-l-2 border-amber-400/80 pl-2.5 py-0.5">
                    "{item.quote}"
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <strong className="text-slate-300">Auditor Assessment:</strong> {item.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
