import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, Info, Headphones, Sliders, ShieldCheck } from 'lucide-react';
import { BUSINESS_PRESETS } from '@/data/presets';
import { AcousticVortexCanvas } from '@/components/reactbits/AcousticVortexCanvas';
import { FeaturesMarquee, FeatureDetailKey } from '@/components/reactbits/FeaturesMarquee';
import { SplitText } from '@/components/reactbits/SplitText';
import { ThemeToggle } from '@/components/ThemeToggle';
import { InflectLogo } from '@/components/InflectLogo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { animateStaggerIn } from '@/lib/animations';
import { AmbientBackdrop } from '@/components/reactbits/AmbientBackdrop';

interface LandingPageProps {
  onOpenAuth: (mode: 'login' | 'register') => void;
  isBackendConnected: boolean;
}

const DETAIL_SPECS: Record<
  FeatureDetailKey,
  { badge: string; title: string; summary: string; bullets: string[] }
> = {
  ingestion: {
    badge: 'Pipeline & Streaming',
    title: '500 MB Resumable Chunks & 1-Hour Map-Reduce',
    summary:
      'Designed to process multi-megabyte and hour-long calls without exhausting browser RAM or hitting HTTP timeouts.',
    bullets: [
      '5 MB chunked resumable upload (POST /api/uploads/init -> PUT /chunk -> /complete) with SHA-256 deduplication.',
      'Magic-byte inspection on chunk 0 rejects spoofed or invalid audio binaries.',
      'imageio-ffmpeg silence-aware 10-minute Map-Reduce chunking with speaker state continuity.',
      'Real-time Server-Sent Events (/api/jobs/{id}/events) and HTTP 206 byte-range audio scrubbing.',
    ],
  },
  tone: {
    badge: 'Accuracy & Isolation',
    title: 'Isolated Representative Tone Scoring',
    summary:
      'Separates customer frustration from sales representative demeanor so reps are never unfairly flagged for angry callers.',
    bullets: [
      '4-axis breakdown: Rep Professionalism, Rep Patience, Rep Empathy, and isolated Customer Frustration.',
      'Every GREEN/RED verdict requires direct verbatim transcript quotes with jump-to-audio timestamps.',
      '4-layer negative-prompt protection blocks inverted criteria like "mark red if polite".',
    ],
  },
  commitments: {
    badge: 'Anti-Hallucination',
    title: 'Grounded Commitments & Null Deadlines',
    summary:
      'Captures explicit next steps agreed on the call without inventing fictional deadlines or owners.',
    bullets: [
      'Unstated timelines stay null rather than fabricated by the LLM.',
      'Commitment Lifecycle Board tracks PENDING -> IN_PROGRESS -> COMPLETED across calls with CSV export.',
      'Analytics tracks exact Deadline Grounding % across the entire tenant workspace.',
    ],
  },
  search: {
    badge: 'PostgreSQL GIN + Human Edits',
    title: 'Full-Text Spoken Search & Tier-1 Sync',
    summary:
      'Search across every spoken word in historical calls and persist transcript corrections in real time.',
    bullets: [
      'PostgreSQL GIN full-text index across transcript_segments.text (GET /api/search/transcripts).',
      'Matching snippets in Call History link straight to the exact second in AudioPlayerBar.',
      'Inline transcript edits (PATCH) update DB rows, record Audit Logs, and sync Tier-1 cache.',
    ],
  },
  presets: {
    badge: 'Configurability',
    title: 'Multi-Industry Presets & 350ms Re-Eval',
    summary:
      'Tune business rubrics, sensitivity sliders, and forbidden phrases without re-uploading a single byte.',
    bullets: [
      'Built-in presets for B2B SaaS Sales, Financial Recovery/Collections, Real Estate, and Custom.',
      'Tier-1 transcript caching re-evaluates updated rubrics in ~350ms.',
      'Deterministic post-LLM guard checks customForbiddenPhrases cleanly.',
    ],
  },
  security: {
    badge: 'Multi-Tenancy & Enterprise',
    title: 'RBAC, Token Budgets & Signed Webhooks',
    summary:
      'Strict workspace isolation backed by PostgreSQL audit logs, daily UTC token limits, and HMAC notifications.',
    bullets: [
      'Salted scrypt passwords, HttpOnly JWTs, ADMIN vs MEMBER RBAC, and org_id query isolation.',
      'Per-tenant daily UTC token budgets with 429 Retry-After enforcement & next-day auto-renewal.',
      'SSRF-validated HTTPS webhooks with HMAC-SHA256 signatures, 3x retries, and DEAD_LETTER state.',
    ],
  },
};

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenAuth,
  isBackendConnected,
}) => {
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeDetail, setActiveDetail] = useState<FeatureDetailKey>('tone');
  const [selectedPresetId, setSelectedPresetId] = useState(BUSINESS_PRESETS[0].id);

  useEffect(() => {
    animateStaggerIn('.hero-reveal', 65);
  }, []);

  const openDetails = (key: FeatureDetailKey) => {
    setActiveDetail(key);
    setDetailOpen(true);
  };

  const activeSpec = DETAIL_SPECS[activeDetail];
  const activePreset =
    BUSINESS_PRESETS.find((p) => p.id === selectedPresetId) || BUSINESS_PRESETS[0];

  const telemetryRows = [
    {
      step: 'Diarized turns & isolated rep score',
      metric: '500 MB',
    },
    {
      step: 'Escalation timestamp cited verbatim',
      metric: '[01:14]',
    },
    {
      step: 'Grounded deadlines without fabrication',
      metric: '0% invented',
    },
  ];

  return (
    <div className="relative min-h-screen flex flex-col bg-canvas text-ink overflow-x-clip">
      {/* Subtle Ambient DotGrid & Aurora Aura */}
      <AmbientBackdrop intensity="hero" />

      {/* Clean Minimal Top Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-subtle bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 sm:px-8 py-3.5">
          <div className="flex items-center gap-2.5">
            <InflectLogo size="sm" />
            <span className="font-display text-sm font-extrabold tracking-tight text-ink">
              INFLECT
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-7 text-xs font-semibold text-ink-muted">
            <a href="#features" className="hover:text-ink transition-colors">
              Features
            </a>
            <button
              type="button"
              onClick={() => openDetails('presets')}
              className="hover:text-ink transition-colors cursor-pointer"
            >
              Rubrics
            </button>
            <button
              type="button"
              onClick={() => openDetails('security')}
              className="hover:text-ink transition-colors cursor-pointer"
            >
              Architecture
            </button>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle compact />
            <Button variant="ghost" size="sm" onClick={() => onOpenAuth('login')}>
              Sign In
            </Button>
            <Button size="sm" onClick={() => onOpenAuth('register')}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO SECTION — Overlapped Text on Lower Half of Tall Sharp Spiral Tornado */}
        <section className="mx-auto w-full max-w-6xl px-6 sm:px-8 pt-6 pb-10">
          <div className="relative rounded-3xl border border-subtle bg-surface/75 backdrop-blur-md overflow-hidden shadow-xl shadow-black/5">
            {/* Tall, Sharp Helical Vortex */}
            <AcousticVortexCanvas className="h-[480px] sm:h-[560px]" />

            {/* Overlapped Lower Hero Typography (Hero 29 composition) */}
            <div className="relative z-10 -mt-56 sm:-mt-64 px-6 sm:px-12 pb-8">
              <h1 className="hero-reveal font-display text-4xl sm:text-5xl lg:text-[3.75rem] font-extrabold tracking-tight leading-[1.03] text-ink max-w-2xl">
                <SplitText text="Find the moment a call turns." delayPerWord={50} />
              </h1>

              <p className="hero-reveal mt-4 text-sm sm:text-base text-ink-muted max-w-lg leading-relaxed">
                See where representative tone shifts, what triggered escalation, and which promises
                carry real deadlines across hour-long calls.
              </p>

              <div className="hero-reveal mt-6 flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={() => onOpenAuth('register')}>
                  Open Workspace
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => openDetails('tone')}>
                  How It Works
                </Button>
              </div>
            </div>

            {/* Clean Hairline Bottom Rail */}
            <div className="relative z-10 border-t border-subtle px-6 sm:px-12 divide-y divide-subtle/70 bg-surface/85 backdrop-blur-sm">
              {telemetryRows.map((row) => (
                <div
                  key={row.step}
                  className="hero-reveal py-3 flex items-center justify-between gap-4 text-xs"
                >
                  <span className="font-medium text-ink-muted">{row.step}</span>
                  <span className="font-mono font-bold text-ink shrink-0">{row.metric}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FEATURES 3 — Minimal Text + Opposite-Scrolling Visual Marquee Grid */}
        <FeaturesMarquee onInspectDetail={openDetails} />
      </main>

      {/* Modern Architectural Anchor Footer */}
      <footer className="mx-auto w-full max-w-6xl px-6 sm:px-8 pb-12 pt-4">
        <div className="relative rounded-3xl border border-subtle overflow-hidden bg-anchor text-ink-anchor px-6 sm:px-12 pt-14 pb-12 shadow-2xl">
          {/* Subtle Ambient Accent Arc */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-48 rounded-full blur-3xl opacity-25"
            style={{ background: 'radial-gradient(circle, var(--accent-primary) 0%, transparent 70%)' }}
          />

          {/* Centered Typographic Brand Core */}
          <div className="relative z-10 text-center max-w-md mx-auto">
            <div className="flex justify-center mb-4">
              <InflectLogo size="lg" className="border-white/15 bg-white/5 shadow-inner" />
            </div>
            <div className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight leading-none">
              inflect
            </div>
            <div className="mt-1.5 text-sm sm:text-base font-medium opacity-75 tracking-wide">
              call intelligence
            </div>

              <div className="mt-7 flex items-center justify-center gap-4 text-xs sm:text-sm font-semibold">
                <button
                  type="button"
                  onClick={() => onOpenAuth('register')}
                  className="text-accent hover:underline cursor-pointer"
                >
                  Create Workspace
                </button>
                <span className="opacity-35">&bull;</span>
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="hover:text-accent transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              </div>

              {/* Clean Technical Drawer Quick Icons */}
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => openDetails('ingestion')}
                  title="500 MB Audio Pipeline & HTTP 206"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <Headphones className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openDetails('presets')}
                  title="Industry Rubrics & Presets"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <Sliders className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openDetails('security')}
                  title="RBAC, Quotas & HMAC Webhooks"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 hover:border-accent hover:text-accent transition-colors cursor-pointer"
                >
                  <ShieldCheck className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Structured Directory Columns (Footer 5 clarity) */}
            <div className="mt-12 pt-8 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-8 text-xs">
              <div className="col-span-2 sm:col-span-1 space-y-2">
                <div className="font-display font-bold text-sm">Inflect</div>
                <p className="text-[11px] opacity-65 leading-relaxed">
                  Multi-tenant voice QA with isolated rep scoring, PostgreSQL FTS, and grounded
                  commitments.
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-[11px] uppercase tracking-wider opacity-55">
                  Platform
                </div>
                <ul className="space-y-1.5 opacity-85">
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('ingestion')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Chunked Uploads
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('tone')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Isolated Tone Audit
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('search')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      GIN Spoken Search
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-[11px] uppercase tracking-wider opacity-55">
                  Governance
                </div>
                <ul className="space-y-1.5 opacity-85">
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('presets')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Business Presets
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('commitments')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Commitment Board
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openDetails('security')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Signed Webhooks
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-[11px] uppercase tracking-wider opacity-55">
                  Workspace
                </div>
                <ul className="space-y-1.5 opacity-85">
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenAuth('login')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Sign In
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => onOpenAuth('register')}
                      className="hover:text-accent transition-colors cursor-pointer"
                    >
                      Create Workspace
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom Corner Anchors (Footer 2 asymmetric signature) */}
            <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-[11px] opacity-65">
              <span>&copy; 2026 Inflect. Multi-tenant call intelligence.</span>
              <div className="sm:text-right font-mono leading-relaxed">
                <div>Gemini &amp; Groq dual-engine</div>
                <div>500 MB chunked &bull; HTTP 206</div>
                <div>Evidence-grounded QA</div>
              </div>
            </div>
          </div>
        </footer>

      {/* On-Demand Technical Details & Presets Drawer (Keeps Landing Clean & Visual-First) */}
      <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
        <SheetContent>
          <div className="border-b border-subtle pb-4 pr-8">
            <Badge variant="accent" className="mb-2">
              {activeSpec.badge}
            </Badge>
            <SheetTitle className="font-display text-lg font-extrabold text-ink">
              {activeSpec.title}
            </SheetTitle>
            <SheetDescription className="text-xs text-ink-muted mt-1">
              {activeSpec.summary}
            </SheetDescription>
          </div>

          <div className="mt-5 flex-1 space-y-6">
            {/* Detail Topic Pills */}
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(DETAIL_SPECS) as FeatureDetailKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveDetail(key)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize border transition-all cursor-pointer ${
                    activeDetail === key
                      ? 'bg-accent text-accent-fg border-transparent'
                      : 'bg-canvas text-ink-muted border-subtle hover:text-ink'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            {/* Technical Breakdown */}
            <div className="space-y-2.5">
              {activeSpec.bullets.map((b) => (
                <div
                  key={b}
                  className="flex items-start gap-2.5 rounded-xl border border-subtle bg-canvas p-3.5 text-xs text-ink"
                >
                  <Info className="h-4 w-4 text-accent shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{b}</span>
                </div>
              ))}
            </div>

            {/* Interactive Industry Presets Preview inside Drawer */}
            <div className="pt-4 border-t border-subtle space-y-3">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                Included Industry Presets
              </div>
              <div className="grid grid-cols-2 gap-2">
                {BUSINESS_PRESETS.map((preset) => {
                  const selected = preset.id === activePreset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPresetId(preset.id)}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left text-xs font-bold transition-all cursor-pointer ${
                        selected
                          ? 'border-accent bg-accent-soft text-ink'
                          : 'border-subtle bg-canvas text-ink-muted hover:text-ink'
                      }`}
                    >
                      <span className="truncate">{preset.name}</span>
                      {selected && <Check className="h-3.5 w-3.5 text-accent shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="rounded-xl border border-subtle bg-canvas p-3.5 text-xs text-ink-muted leading-relaxed">
                <strong className="text-ink block mb-1">
                  {activePreset.industry} ({activePreset.defaultSensitivity.toUpperCase()})
                </strong>
                {activePreset.defaultToneCriteria}
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-subtle flex items-center justify-end gap-2.5">
            <Button variant="ghost" size="sm" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDetailOpen(false);
                onOpenAuth('register');
              }}
            >
              Launch Workspace
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
