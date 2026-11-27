import React from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Quote,
  UserCheck,
  Compass,
  Check,
  X,
  MessageCircleHeart,
} from 'lucide-react';
import { ToneAnalysisResult, CallMetadata } from '@/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CountUp } from '@/components/reactbits/CountUp';

interface ToneCardProps {
  tone: ToneAnalysisResult;
  callMetadata?: CallMetadata | null;
  onJumpToTimestamp?: (timestamp: string) => void;
}

export const ToneCard: React.FC<ToneCardProps> = ({
  tone,
  callMetadata,
  onJumpToTimestamp,
}) => {
  const isGreen = tone.rating === 'GREEN';

  const qualityScore = Math.round(
    0.4 * tone.sentimentBreakdown.repProfessionalism +
      0.35 * tone.sentimentBreakdown.repPatience +
      0.25 * tone.sentimentBreakdown.repEmpathy
  );

  return (
    <Card
      className={`relative overflow-hidden p-6 shadow-sm ${
        isGreen ? 'border-status-green/35' : 'border-status-red/40'
      }`}
    >
      {/* Top Verdict & Score Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-subtle">
        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-display font-extrabold text-sm tracking-wide shadow-xs ${
              isGreen
                ? 'bg-status-green text-white'
                : 'bg-status-red text-white'
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

          <div className="flex items-center gap-1.5 text-xs text-ink-muted bg-canvas px-3 py-1.5 rounded-xl border border-subtle">
            <UserCheck className="h-3.5 w-3.5 text-accent" />
            <span>
              Target: <strong className="text-ink">Sales Representative Only</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5 bg-canvas px-3.5 py-1.5 rounded-xl border border-subtle">
            <div className="text-right">
              <div className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
                Overall Quality
              </div>
              <div
                className={`text-sm font-mono font-bold ${
                  isGreen ? 'text-status-green' : 'text-status-red'
                }`}
              >
                <CountUp to={qualityScore} suffix=" / 100" />
              </div>
            </div>
            <div className="h-2 w-16 rounded-full bg-subtle overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isGreen ? 'bg-status-green' : 'bg-status-red'
                }`}
                style={{ width: `${qualityScore}%` }}
              />
            </div>
          </div>

          <div className="bg-canvas px-3.5 py-1.5 rounded-xl border border-subtle text-right">
            <div className="text-[10px] uppercase font-bold text-ink-muted tracking-wider">
              Confidence
            </div>
            <div className="text-sm font-mono font-bold text-ink">{tone.confidenceScore}%</div>
          </div>
        </div>
      </div>

      {/* Main Analysis Body */}
      <div className="mt-5 space-y-4">
        {callMetadata && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-canvas border border-subtle text-xs">
            <div className="flex items-center gap-2">
              <Badge variant="accent" className="rounded-lg px-2.5 py-1">
                <Compass className="h-3.5 w-3.5" />
                Domain: <strong className="ml-1">{callMetadata.detectedCategory}</strong>
              </Badge>
              <span className="text-[11px] font-mono text-ink-muted">
                ({callMetadata.categoryConfidence}% match)
              </span>
            </div>
            {callMetadata.domainSummary && (
              <p className="text-[11px] text-ink-muted italic">"{callMetadata.domainSummary}"</p>
            )}
          </div>
        )}

        <div>
          <h3 className="font-display text-base font-extrabold text-ink">{tone.headline}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">{tone.explanation}</p>
        </div>

        {/* Multi-Dimensional Sentiment Isolation */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
          <div className="rounded-xl bg-canvas p-3 border border-subtle">
            <span className="text-[10px] text-ink-muted font-bold uppercase block">
              Professionalism
            </span>
            <span className="text-sm font-bold text-ink font-mono">
              {tone.sentimentBreakdown.repProfessionalism}/100
            </span>
          </div>
          <div className="rounded-xl bg-canvas p-3 border border-subtle">
            <span className="text-[10px] text-ink-muted font-bold uppercase block">
              Empathy Score
            </span>
            <span className="text-sm font-bold text-ink font-mono">
              {tone.sentimentBreakdown.repEmpathy}/100
            </span>
          </div>
          <div className="rounded-xl bg-canvas p-3 border border-subtle">
            <span className="text-[10px] text-ink-muted font-bold uppercase block">
              Patience / Composure
            </span>
            <span className="text-sm font-bold text-ink font-mono">
              {tone.sentimentBreakdown.repPatience}/100
            </span>
          </div>
          <div className="rounded-xl bg-accent-soft p-3 border border-accent/35">
            <span className="text-[10px] text-accent font-bold uppercase block">
              Customer Friction (Isolated)
            </span>
            <span className="text-sm font-bold text-ink font-mono">
              {tone.sentimentBreakdown.customerFrustration}/100
            </span>
          </div>
        </div>

        {/* Universal Politeness & Etiquette Checklist */}
        <div className="rounded-xl border border-subtle bg-canvas p-3.5">
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <MessageCircleHeart className="h-3.5 w-3.5 text-accent" />
              Universal Politeness &amp; Etiquette Checklist
            </h4>
            <span className="text-[11px] text-ink-muted">Baseline Conduct Audit</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              { ok: callMetadata?.greetingObserved !== false, label: 'Greeting & Politeness Opening' },
              { ok: callMetadata?.politeLanguageObserved !== false, label: 'Active Courtesy & Affirmations' },
              { ok: callMetadata?.professionalClosingObserved !== false, label: 'Professional Closing / Sign-off' },
            ].map((item) => (
              <div
                key={item.label}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold ${
                  item.ok
                    ? 'border-status-green/30 bg-status-green-soft text-status-green'
                    : 'border-status-red/30 bg-status-red-soft text-status-red'
                }`}
              >
                {item.ok ? (
                  <Check className="h-4 w-4 shrink-0" />
                ) : (
                  <X className="h-4 w-4 shrink-0" />
                )}
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {callMetadata?.etiquetteNotes && callMetadata.etiquetteNotes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5 pt-2 border-t border-subtle">
              {callMetadata.etiquetteNotes.map((note, idx) => (
                <span
                  key={idx}
                  className="rounded-md bg-surface px-2 py-0.5 text-[10px] text-ink-muted border border-subtle"
                >
                  &bull; {note}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Supporting Evidence Quotes */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Quote className="h-3.5 w-3.5 text-accent" />
              Supporting Evidence Quotes (Grounded in Transcript)
            </h4>
            <span className="text-[11px] text-ink-muted">
              {tone.evidenceQuotes.length} Verified Snippets
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {tone.evidenceQuotes.map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl border border-subtle bg-canvas p-3.5 hover:border-accent/50 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] font-mono text-ink-muted mb-2">
                    <span className="font-bold text-accent">{item.speaker}</span>
                    {item.timestamp && (
                      <button
                        type="button"
                        onClick={() => onJumpToTimestamp && onJumpToTimestamp(item.timestamp!)}
                        className="rounded-md bg-surface border border-subtle px-2 py-0.5 text-[10px] text-ink hover:border-accent hover:text-accent cursor-pointer"
                        title="Click to seek audio"
                      >
                        {item.timestamp}
                      </button>
                    )}
                  </div>
                  <p className="text-xs italic text-ink border-l-2 border-accent pl-2.5 py-0.5">
                    "{item.quote}"
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-subtle text-[11px] text-ink-muted">
                  <strong className="text-ink">Auditor Rationale:</strong> {item.explanation}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
