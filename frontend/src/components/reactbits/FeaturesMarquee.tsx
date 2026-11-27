import React, { useEffect, useRef } from 'react';
import {
  UploadCloud,
  UserCheck,
  CalendarCheck2,
  Search,
  CheckCircle2,
  AlertOctagon,
  Sliders,
  Coins,
  Webhook,
  ArrowUpRight,
} from 'lucide-react';
import { animate, onScroll, stagger } from 'animejs';
import { Badge } from '@/components/ui/badge';
import { prefersReducedMotion } from '@/lib/animations';

export type FeatureDetailKey = 'ingestion' | 'tone' | 'commitments' | 'search' | 'presets' | 'security';

interface FeaturesMarqueeProps {
  onInspectDetail: (key: FeatureDetailKey) => void;
}

interface VisualCardSpec {
  id: string;
  detailKey: FeatureDetailKey;
  title: string;
  tag: string;
  visual: React.ReactNode;
}

export const FeaturesMarquee: React.FC<FeaturesMarqueeProps> = ({ onInspectDetail }) => {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current || prefersReducedMotion()) return;
    const targets = sectionRef.current.querySelectorAll('.feature-highlight');
    if (!targets.length) return;
    try {
      const obs = onScroll({
        target: sectionRef.current,
        enter: 'bottom-=60 top',
      });
      const anim = animate(targets, {
        opacity: [0, 1],
        translateY: [14, 0],
        duration: 450,
        delay: stagger(70),
        ease: 'outCubic',
        autoplay: obs,
      });
      return () => {
        obs.revert();
        anim.pause();
      };
    } catch {
      return;
    }
  }, []);
  const highlights: Array<{ icon: React.ReactNode; label: string; detailKey: FeatureDetailKey }> = [
    {
      icon: <UploadCloud className="h-4 w-4 text-accent" />,
      label: '500 MB chunked uploads & SSE',
      detailKey: 'ingestion',
    },
    {
      icon: <UserCheck className="h-4 w-4 text-accent" />,
      label: 'Isolated rep tone evaluation',
      detailKey: 'tone',
    },
    {
      icon: <CalendarCheck2 className="h-4 w-4 text-accent" />,
      label: 'Zero fabricated deadlines',
      detailKey: 'commitments',
    },
    {
      icon: <Search className="h-4 w-4 text-accent" />,
      label: 'Full-text transcript jump',
      detailKey: 'search',
    },
  ];

  const leftColumnCards: VisualCardSpec[] = [
    {
      id: 'tone-green',
      detailKey: 'tone',
      title: 'Isolated Demeanor Score',
      tag: 'GREEN',
      visual: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="green" className="text-[10px]">
              <CheckCircle2 className="h-3 w-3" /> COMPLIANT
            </Badge>
            <span className="font-mono text-xs font-bold text-ink">4.8 / 5.0</span>
          </div>
          <div className="space-y-2 text-[11px]">
            <div>
              <div className="flex justify-between text-ink-muted mb-1">
                <span>Rep Empathy</span>
                <span className="font-mono text-ink font-semibold">92%</span>
              </div>
              <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                <div className="h-full w-[92%] rounded-full bg-status-green" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-ink-muted mb-1">
                <span>Customer Anger (Isolated)</span>
                <span className="font-mono text-accent font-semibold">74%</span>
              </div>
              <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                <div className="h-full w-[74%] rounded-full bg-accent" />
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'waveform-chunk',
      detailKey: 'ingestion',
      title: '1-Hour Map-Reduce',
      tag: 'HTTP 206',
      visual: (
        <div className="space-y-3">
          <div className="flex items-end gap-1 h-11 px-1">
            {[28, 52, 40, 88, 65, 34, 92, 58, 76, 44, 85, 50, 68, 30, 74, 48].map((h, idx) => (
              <span
                key={idx}
                className={`flex-1 rounded-full ${
                  idx >= 6 && idx <= 9 ? 'bg-accent' : 'bg-ink/25'
                }`}
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between font-mono text-[10px] text-ink-muted">
            <span>00:00</span>
            <span className="text-accent font-bold">Chunk 3/6 &bull; 5 MB</span>
            <span>58:40</span>
          </div>
        </div>
      ),
    },
    {
      id: 'preset-rubric',
      detailKey: 'presets',
      title: '0-Byte Rubric Re-Eval',
      tag: '~350ms',
      visual: (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-ink">
            <Sliders className="h-3.5 w-3.5 text-accent" />
            <span>FinTech / Collections</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[10px] text-center">
            <div className="rounded-lg border border-subtle bg-canvas py-1.5 text-ink-muted">LOW</div>
            <div className="rounded-lg border border-subtle bg-canvas py-1.5 text-ink-muted">BAL</div>
            <div className="rounded-lg bg-accent py-1.5 text-accent-fg font-bold">STRICT</div>
          </div>
        </div>
      ),
    },
  ];

  const rightColumnCards: VisualCardSpec[] = [
    {
      id: 'red-escalation',
      detailKey: 'tone',
      title: 'Timestamped Escalation',
      tag: '[01:14]',
      visual: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <Badge variant="red" className="text-[10px]">
              <AlertOctagon className="h-3 w-3" /> RED FLAG
            </Badge>
            <span className="font-mono text-[10px] text-accent font-bold">Seek 01:14</span>
          </div>
          <p className="text-[11px] italic text-ink border-l-2 border-status-red pl-2.5 py-0.5 line-clamp-2">
            "If your team can't understand basic docs, no vendor can help."
          </p>
        </div>
      ),
    },
    {
      id: 'fts-search',
      detailKey: 'search',
      title: 'GIN Spoken Search',
      tag: 'FTS',
      visual: (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-subtle bg-canvas px-2.5 py-1.5 text-[11px] font-mono text-ink">
            <Search className="h-3 w-3 text-accent shrink-0" />
            <span>"phased pilot"</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-muted">
            <span className="truncate">...scope a phased 15-seat pilot...</span>
            <span className="font-mono text-accent font-bold ml-2 shrink-0">[00:42]</span>
          </div>
        </div>
      ),
    },
    {
      id: 'quota-webhook',
      detailKey: 'security',
      title: 'Quotas & HMAC Webhooks',
      tag: 'TENANT',
      visual: (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <Coins className="h-3.5 w-3.5 text-accent" />
              Daily Budget
            </span>
            <span className="font-mono text-[10px] text-ink-muted">42k / 500k</span>
          </div>
          <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
            <div className="h-full w-[18%] rounded-full bg-accent" />
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-status-green">
            <Webhook className="h-3 w-3" />
            <span>HMAC-SHA256 &bull; DELIVERED</span>
          </div>
        </div>
      ),
    },
  ];

  const renderMarqueeCard = (card: VisualCardSpec, keySuffix: string) => (
    <button
      key={`${card.id}-${keySuffix}`}
      type="button"
      onClick={() => onInspectDetail(card.detailKey)}
      className="w-full text-left rounded-2xl border border-subtle bg-surface p-4 shadow-sm hover:border-accent transition-all cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-ink group-hover:text-accent transition-colors">
          {card.title}
        </span>
        <span className="font-mono text-[10px] font-bold text-ink-muted flex items-center gap-1">
          {card.tag}
          <ArrowUpRight className="h-3 w-3 opacity-0 group-hover:opacity-100 text-accent transition-opacity" />
        </span>
      </div>
      {card.visual}
    </button>
  );

  return (
    <section ref={sectionRef} id="features" className="mx-auto w-[92%] max-w-6xl py-16 sm:py-24">
      {/* React Bits Pro Features-3 Layout: Header + 2x2 Minimal Icon Highlights */}
      <div className="max-w-2xl mb-12">
        <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">
          Built for audio intelligence at scale.
        </h2>
        <p className="mt-3 text-sm sm:text-base text-ink-muted leading-relaxed">
          Inspect calls visually first. Click any live capability tile below to explore presets,
          guardrails, and scaling mechanics.
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
          {highlights.map((h) => (
            <button
              key={h.label}
              type="button"
              onClick={() => onInspectDetail(h.detailKey)}
              className="feature-highlight flex items-center gap-3.5 text-left group cursor-pointer"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-subtle bg-surface group-hover:border-accent transition-colors shadow-xs">
                {h.icon}
              </span>
              <span className="text-xs sm:text-sm font-semibold text-ink group-hover:text-accent transition-colors">
                {h.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Opposite-Scrolling Visual Marquee Grid (Features 3 Dual Columns) */}
      <div className="relative rounded-3xl border border-subtle bg-surface-elevated/60 p-4 sm:p-6 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 h-[420px] sm:h-[460px] overflow-hidden relative">
          {/* Left Column — Scrolling Up */}
          <div className="marquee-column overflow-hidden h-full">
            <div className="flex flex-col gap-4 animate-marquee-up">
              {leftColumnCards.map((c) => renderMarqueeCard(c, 'a'))}
              {leftColumnCards.map((c) => renderMarqueeCard(c, 'b'))}
            </div>
          </div>

          {/* Right Column — Scrolling Down (Opposite Direction) */}
          <div className="marquee-column overflow-hidden h-full hidden md:block">
            <div className="flex flex-col gap-4 animate-marquee-down">
              {rightColumnCards.map((c) => renderMarqueeCard(c, 'a'))}
              {rightColumnCards.map((c) => renderMarqueeCard(c, 'b'))}
            </div>
          </div>

          {/* Top & Bottom Soft Fade Masks */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-16 z-10"
            style={{
              background: 'linear-gradient(to bottom, var(--bg-surface-elevated), transparent)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-10"
            style={{
              background: 'linear-gradient(to top, var(--bg-surface-elevated), transparent)',
            }}
          />
        </div>
      </div>
    </section>
  );
};
