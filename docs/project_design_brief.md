# Inflect — Call Quality & Conversation Intelligence Platform
## Complete Product, Architecture & UI Design Brief (`project_design_brief.md`)

> **Purpose of This Document:** This file provides a complete functional, architectural, and visual specification of the **Inflect Call Intelligence Platform**. Any UI designer, front-end generator, or AI tool reading this brief should use it to propose page layouts, visual hierarchy, component architecture, and styling **strictly following the color themes, component libraries, font pairings, and animation stack defined below**.

---

## 1. Executive Summary & Project Motive

### What the Application Does
**Inflect (Call Quality & Conversation Intelligence Platform)** is an enterprise, multi-tenant call intelligence and QA compliance web platform. Teams upload customer-facing call recordings (`.m4a`, `.mp3`, `.wav`, `.ogg`, `.webm`, `.aac`, `.flac` up to **500 MB / 1-hour+ calls**) and receive:
1. **Accurate Speaker-Diarized Transcripts** separating Representative (`Sales Rep`) vs. Customer (`Customer`).
2. **Isolated Representative Tone Verdicts (`GREEN` vs. `RED`)** backed by timestamped verbatim evidence quotes — never blaming an agent simply because the customer is upset.
3. **Anti-Hallucination Action Item & Commitment Extraction** capturing who promised what, with explicit deadlines only (unstated dates remain `null` instead of invented).
4. **Domain-Agnostic Business Configurability** allowing QA managers to switch presets (*B2B SaaS Sales*, *Financial Recovery / Debt Collection*, *Real Estate & Advisory*, *Custom Rubric*), tune flag sensitivity, and add forbidden phrases without code changes.
5. **Continuous Operations Workspace** featuring cross-call full-text transcript search, human-in-the-loop transcript editing, a commitment tracking board, tenant-scoped coaching analytics, daily AI token quota governance, RBAC administration, and signed outbound webhooks.

### Core Motive & Problems Solved
- **Blind Spot Coverage:** Manual QA audits less than 5% of calls; automated auditing covers 100% consistently.
- **Fair Agent Scoring:** Customer frustration (`customerFrustration`) is explicitly measured separately from agent metrics (`repProfessionalism`, `repEmpathy`, `repPatience`).
- **Trust & Auditability:** Every verdict, commitment, and admin action links to exact timestamps, audio byte-range playback, and immutable database audit trails.
- **Enterprise Resilience:** Scales to long 1-hour recordings, rate-limit spikes, AI provider failovers, and multi-tenant isolation without losing jobs or leaking tenant data.

---

## 2. Critical UX Entry-Point Fix (Landing Page Requirement)

> **Current UX Gap:** Unauthenticated users hitting `/` (`localhost:3000`) are immediately blocked by a centered `Sign In to Workspace` modal over an empty blurred dashboard shell.
>
> **Required Redesign:** Replace the immediate login wall with a dedicated, high-impact **Public Landing Page** on `/` (`!currentUser`), where visitors can explore the product, toggle Day/Night themes, inspect live capability previews, and explicitly click **Sign In** or **Create Workspace** (opening an auth modal or dedicated `/login` & `/register` view).

### Required Landing Page Structure (`/`)
1. **Top Public Navigation Bar:** Brand mark (`INFLECT`), anchor links (`Capabilities`, `Industry Presets`, `Architecture`, `Security`), **Day/Night Theme Toggle**, and primary actions (`Sign In`, `Launch Workspace` / `Create Workspace`).
2. **Hero Section (Above the Fold):**
   - Headline communicating automated, evidence-grounded QA for 1-hour+ sales & support calls.
   - Dual CTAs: `Create Workspace` (Primary) & `Sign In` / `Explore Live Flow`.
   - Interactive / animated **Product Preview Card** showing an example call waveform, `GREEN` / `RED` tone verdict pill, isolated Rep vs. Customer sentiment meters, and clickable timestamped quote chip.
3. **Problem -> Solution Contrast Strip:** Manual 5% spot checks & unfair customer-anger penalties vs. 100% automated, isolated rep scoring & anti-hallucination commitments.
4. **Core Feature Showcase (Interactive Bento / Grid):**
   - *Resumable 500 MB Uploads & 1-Hour Map-Reduce* (`5 MB` chunks, `SHA-256` dedup, SSE streaming progress).
   - *Evidence-Grounded Verdict Engine* (Clickable `[00:15]` jump-to-audio quotes + `HTTP 206` byte-range waveform player).
   - *Multi-Business Configurability* (Zero-reupload `~350ms` re-analysis when rubrics change).
   - *Full-Text Transcript Search & Human-in-the-Loop Edits* (PostgreSQL `GIN` FTS + Tier-1 cache sync).
5. **Multi-Industry Presets Preview:** Interactive tab/card switcher showcasing *B2B SaaS Sales*, *Financial Recovery / Debt Collection*, *Real Estate & Advisory*, and *Custom Rubric*.
6. **Enterprise Trust, Security & Scaling Strip:** Summarizing `scrypt` + `HttpOnly` JWT multi-tenancy, 4-layer negative-prompt injection guards, daily token budgets, SSRF-protected HMAC webhooks, and Gemini + Groq dual-engine circuit breakers.
7. **Footer CTA:** Direct prompt to create an isolated workspace or sign in.

---

## 3. Strict Visual Design System & Color Tokens

The UI **must** enforce two bespoke, high-craft color modes switchable by the user (persisted in `localStorage` and respecting system default cleanly):

### ☀️ Day Mode (Light Theme): **Navy + Sand + Tangerine**
| Role | Color Name | Suggested Hex Tokens | Usage Guidance |
| :--- | :--- | :--- | :--- |
| **Page Canvas** | Warm Sand | `#F5EFE6` / `#F3ECE1` | Primary viewport background, generous breathing room |
| **Elevated Surfaces / Cards** | Light Sand / Alabaster | `#FCF9F4` / `#FFFFFF` (tinted `#FAF6EE`) | Cards, drawers, modals, table surfaces |
| **Structural Borders & Dividers** | Deep Sand | `#E3D9C6` / `#D6C9B2` | `1px` crisp borders, input outlines, subtle separators |
| **Primary Ink, Headers & Anchors** | Deep Navy | `#0F1E36` / `#162947` | Display headings, primary body ink, navbar anchors, dark contrast sections |
| **Secondary / Muted Ink** | Slate Navy | `#4A5B75` | Captions, table labels, secondary metadata |
| **Primary Brand Accent & CTAs** | Tangerine | `#F97316` / `#FF6B2B` (hover `#EA580C`) | Primary buttons, active navigation indicators, audio waveform scrub head, progress bars, focus rings |
| **Accent Soft Tint** | Pale Tangerine | `rgba(249, 115, 22, 0.12)` | Pill backgrounds, selected chips, active step halos |

### 🌙 Night Mode (Dark Theme): **Charcoal + Dusty Purple + Gold**
| Role | Color Name | Suggested Hex Tokens | Usage Guidance |
| :--- | :--- | :--- | :--- |
| **Page Canvas** | Deep Charcoal | `#121116` / `#18161D` | Primary dark viewport canvas (never flat pitch-black) |
| **Elevated Surfaces / Cards** | Dusty Purple Charcoal | `#1F1B29` / `#272134` | Cards, navigation shell, modals, slide-over drawers |
| **Secondary Accent Planes** | Dusty Purple | `#342C44` / `#6E5A8A` | Active containers, subtle ambient glows, hover surfaces, muted badges (`#A89BC2` secondary text) |
| **Primary Ink & Headings** | Warm Ivory | `#F5F2EB` | High-contrast readable body text and headers |
| **Primary Brand Accent & CTAs** | Warm Gold | `#E5B94E` / `#D4A537` (hover `#F0CA68`) | Primary buttons, active tabs, waveform scrub cursor, quota bars, premium status indicators |
| **Accent Soft Tint** | Soft Gold Wash | `rgba(229, 185, 78, 0.14)` | Highlighted badges, selected preset cards, focus rings |

### Semantic Status Colors (Accessible in Both Modes)
- **`GREEN` (Compliant Verdict / Delivered Webhook / Completed Task):** Emerald-Sage (`#15803D` / `#10B981` with mode-appropriate tinted backgrounds) so compliance state remains unmistakable.
- **`RED` (Tone Violation / Dead-Letter Webhook / Quota Exhausted):** Crimson-Coral (`#DC2626` / `#F43F5E` with mode-appropriate tinted backgrounds) so escalations remain unmistakable.

---

## 4. Required UI Stack, Libraries & Font Architecture

Any suggested UI architecture should target the existing frontend runtime (**React 19 + TypeScript + Vite 8 + Tailwind CSS v4**) and incorporate the user-specified libraries:

### 1. Component & Background Libraries
- **shadcn/ui** (`class-variance-authority`, `clsx`, `tailwind-merge`, Radix UI primitives via `radix-ui` or `@radix-ui/*` packages):
  - Used for structured **forms, inputs, selects, dialogs/modals, slide-over sheets (`ConfigDrawer`), tabs, tooltips, dropdowns, badges, switches, sliders, and data tables**.
- **React Bits** (`https://reactbits.dev` — `shadcn`-compatible Registry / copy-in React + Tailwind TSX components):
  - **Backgrounds (Hero & Atmospheric Canvases):** e.g., Subtle *Grid / Dot Pattern*, *Aurora / Silk / Light Rays / Particles* tuned strictly to **Sand/Navy/Tangerine** (Day) and **Charcoal/Dusty Purple/Gold** (Night) with low visual noise behind data cards.
  - **Hero & Typography Motion:** *SplitText / BlurText / ShinyText* for hero headline and verdict reveal moments.
  - **Interactive Surfaces & Buttons:** *SpotlightCard / TiltedCard / Magnet / StarBorder* for Landing feature tiles, Preset selector cards, and Upload Dropzone highlight.
  - **Loaders & Progress Micro-UI:** Smooth indeterminate / SSE progress indicators & counter animations (`CountUp`).

### 2. Orchestration Animation Library
- **Anime.js (`animejs` v4):**
  - Orchestrated card/list staggered reveals on route & tab transitions.
  - Smooth numerical counter interpolation (`overallScore`, `overallQuality`, KPI metrics, quota percentage).
  - Multi-bar **audio waveform / equalizer loader** during file chunking & SSE processing stages.
  - Slide-over drawer & verdict badge entrance choreography (always paired with `prefers-reduced-motion` guard).

### 3. Recommended Font Libraries (`@fontsource/*` or Google Fonts)
Pair expressive geometric readability with crisp tabular telemetry:
- **Display & Headings:** `Plus Jakarta Sans` (Weights `600`, `700`, `800`) or `Space Grotesk` (editorial sharpness with technical confidence) — *or optional editorial serif accent like `Instrument Serif` for hero emphasis*.
- **UI Body & Transcript Copy:** `Inter` or `Plus Jakarta Sans` (Weights `400`, `500`, `600`) for long-form diarized transcripts and dense tables.
- **Telemetry, Timestamps, Scores & API Keys:** `JetBrains Mono` (tabular-nums enabled for `00:15`, `4.6 / 5.0`, token counters, and `whsec_...` previews).

### 4. Icons
- **Lucide React (`lucide-react`)** (already installed in `frontend/package.json`).

---

## 5. Complete Application Information Architecture & Functional Inventory

Once authenticated (`currentUser !== null`), the user operates inside a workspace (`orgName`, role `ADMIN` or `MEMBER`) with the following screens and interactive components:

### A. Global Navigation Shell (`Navbar`)
- **Left:** Brand mark (`INFLECT`) + Call QA pill + click-to-home.
- **Center Navigation Tabs (`AppNavTab`):**
  1. `Live Auditor` (`auditor`)
  2. `Call History` (`history`)
  3. `Commitments` (`commitments`)
  4. `Analytics` (`analytics`)
  5. `Admin` (`admin`) — **Rendered only when `user.role === 'ADMIN'`**
- **Right Utility Cluster:**
  - **Day / Night Theme Toggle** (Sun / Moon switch between Navy-Sand-Tangerine & Charcoal-DustyPurple-Gold)
  - **Daily AI Token Quota Pill:** Live `usedToday / dailyLimit` (e.g. `12.4k / 500k`), turns amber at `>= 80%` and rose when exhausted with UTC renewal tooltip (`renewsAtUtc`), clicks through to Analytics
  - **Workspace Badge:** Displays `user.orgName`
  - **System Health Dot:** Live `/api/health` + circuit breaker status
  - **Config Settings Button:** Opens `ConfigDrawer` (`Preset` pill indicator)
  - **Logout Button**

---

### B. Screen 1 — Live Auditor (`auditor` tab)

#### State 1: Ready to Upload / Processing (`!currentReport || isProcessing`)
- **Upload Dropzone (`UploadDropzone`):**
  - Accepts drag-and-drop or file picker up to **500 MB** (`MAX_UPLOAD_BYTES`), formats `.m4a`, `.mp3`, `.wav`, `.ogg`, `.webm`, `.aac`, `.flac`.
  - Computes incremental browser **SHA-256** (`uploadClient.ts`) -> calls `POST /api/uploads/init`:
    - If already uploaded in this tenant: **0-byte instant deduplication**.
    - Otherwise streams **5 MB chunks** via `PUT /api/uploads/{id}/chunk/{idx}` with resume support -> `POST /api/uploads/{id}/complete`.
  - Quick-load built-in sample recordings (`test_call_green.m4a`, `test_call_red.m4a`, `test_call_multilingual.m4a`).
- **Async Progress Stepper & SSE Stream (`GET /api/jobs/{jobId}/events`):**
  - Queues job via `POST /api/analyze/async` (`202 Accepted` with `Idempotency-Key` header).
  - Live `progressPct` (`0–100%`), `stageMessage`, chunk counter (`completedChunks / totalChunks`) for 10-minute Map-Reduce splits on long recordings.
  - Quota Exhaustion Banner (`429 DAILY_QUOTA_EXCEEDED`) displaying renewal countdown to `00:00 UTC`.

#### State 2: Completed Audit View (`currentReport`)
- **1. Sticky Audio Player Bar (`AudioPlayerBar`):**
  - Streams via `GET /api/assets/{assetId}/stream` using `HTTP 206 Partial Content` byte ranges (authenticated via cookie or short-lived `media_token`).
  - Controls: Play / Pause, interactive timeline scrubber (`HH:MM:SS`), playback speed (`1x`, `1.25x`, `1.5x`, `2x`), filename, duration, file size, `Cached Hit` / `AI Engine Used` badge (`Gemini Flash` / `Groq Llama`), Export JSON, and Analyze Another Call reset button.
- **2. Two-Column Inspection Grid (`12-col` layout: `5 cols` Left / `7 cols` Right):**
  - **Left Column — Compliance & Extraction Panels:**
    - **`ToneCard`:**
      - `GREEN (COMPLIANT)` or `RED (VIOLATION)` verdict banner + `"Target: Sales Representative Only"` badge.
      - Weighted Overall Quality Meter (`40% Professionalism + 35% Patience + 25% Empathy`, `0–100`) & Confidence Score (`%`).
      - Executive Headline & Detailed Explanation.
      - **4 Sentiment Breakdown Bars:** `Rep Professionalism`, `Rep Patience`, `Rep Empathy`, and isolated `Customer Frustration` (with explicit visual contrast showing rep scores don't inherit customer anger).
      - **Domain & Etiquette Intelligence (`callMetadata`):** Detected Call Category & confidence, Domain Summary, Etiquette Checklist chips (`Greeting Observed`, `Polite Language`, `Professional Closing`), and etiquette notes.
      - **Evidence Quotes List:** Clickable timestamp chips (`00:15`) that seek `AudioPlayerBar` directly to that exact second + highlight the quote's rationale.
    - **`ActionItemsList`:**
      - Extracted follow-up tasks (`task`, `owner` pill: `Sales Rep` / `Customer` / `Unspecified`, `deadline` or `"No deadline stated"`, verbatim `evidenceQuote`, confidence %, clickable timestamp seek button, interactive status toggle `PENDING` -> `IN_PROGRESS` -> `COMPLETED`).
    - **Rubric Transparency Summary Card:** Shows 40% Accuracy / 30% UX / 30% Configurability compliance indicators.
  - **Right Column — Diarized Transcript Viewer (`TranscriptViewer`):**
    - Search/filter within transcript turns & speaker filter.
    - Turn-by-turn bubbles distinguishing **Sales Rep** vs **Customer**, clickable `[MM:SS]` timestamp seeking audio player, and highlighted **Flagged Evidence** turns on `RED` alerts.
    - **Human-in-the-Loop Inline Edit Mode:** Edit turn text & speaker label -> persists via `PATCH /api/history/{callId}/transcript/{segmentId}` to DB, records `TRANSCRIPT_EDITED` in audit logs, and syncs Tier-1 audio base cache.

---

### C. Slide-Over Configurability Panel (`ConfigDrawer`)
Accessible from Navbar at any time:
1. **Business Presets Selector (4 Cards):**
   - `saas_sales` (*B2B SaaS Sales*)
   - `debt_collection` (*Financial Recovery / Debt Collection*)
   - `real_estate` (*Real Estate & Advisory*)
   - `custom` (*Custom Rubric*)
2. **Demeanor Sensitivity Selector:** `Low` | `Balanced` | `Strict`
3. **Custom Tone Criteria Editor:** Rich textarea (protected by **4-layer negative-prompt injection guards**: frontend pre-check + Pydantic regex validator blocking inverted rules like *"mark red if polite"* or *"ignore insults"* + `<CONFIG_RUBRIC>` XML isolation + post-LLM deterministic guards).
4. **Action Item Extraction Scope:** `explicit_commitments` | `all_followups` | `strict_deadlines_only`
5. **Custom Forbidden Phrases Tag Input:** Add/remove trigger phrases (`customForbiddenPhrases`) deterministically checked post-LLM with exact transcript quotes.
6. **Speaker Diarization Override:** `Auto-Detect` | `Speaker 0 is Rep` | `Speaker 1 is Rep`
7. **AI Engine Preference:** `Gemini Multimodal` (Primary) | `Groq Whisper + Llama-3.3`
8. **Footer Actions:** `Apply Settings` or **`Apply & Re-Analyze Loaded Call`** (0-byte re-upload via `assetId`, hitting Tier-1 cached transcript for `~350ms` rubric re-evaluation).

---

### D. Screen 2 — Call History Explorer (`history` tab — `CallHistoryView`)
- **Full-Text Search Bar (`GET /api/history?search=...`):** Searches filename, headline, category, AND spoken transcript words via PostgreSQL `GIN` index (`to_tsvector` / `plainto_tsquery` + `GET /api/search/transcripts`).
- **Tone Filter Pills:** `All` | `Compliant (GREEN)` | `Red Flags (RED)`
- **Data Table:** Date/Time, Recording Name & Duration, Category pill, Granular Demeanor Score (`0.5–2.9` RED / `3.0–5.0` GREEN out of `5.0`), Commitments count badge, Turns count, `Open Audit` & Delete (Admin) buttons.
- **Spoken Match Snippet Pill:** When search matches inside spoken dialogue, renders a clickable `[MM:SS] "...matched phrase..."` chip that opens the call AND jumps `AudioPlayerBar` straight to that second (`seekSeconds`).
- **Keyset Cursor Pagination (`Load More`):** O(log N) `(created_at, id)` cursor pagination with zero N+1 queries.

---

### E. Screen 3 — Commitments Lifecycle Board (`commitments` tab — `CommitmentsBoard`)
- Tracks every promised next step across all tenant calls (`GET /api/commitments`).
- Filters: Status (`ALL`, `PENDING`, `IN_PROGRESS`, `COMPLETED`), Owner (`ALL`, `Rep`, `Customer`), local keyword search.
- Interactive status progression (`PATCH /api/commitments/{id}`), CSV export button, keyset cursor pagination (`Load More`).

---

### F. Screen 4 — Team Analytics & Coaching Telemetry (`analytics` tab — `AnalyticsDashboard`)
- **Top KPI Row:** Total Calls Audited, Average Quality Score (`/ 5.0`), RED Flag Escalation Rate (`%`), Commitment Completion Rate (`%`).
- **Tenant Daily AI Token Quota & Renewal Panel (`GET /api/org/token-quota`):**
  - Progress meter (`usedToday / dailyLimit`), remaining tokens, live UTC renewal timestamp (`renewsAtUtc`), all-time tokens & estimated USD spend, and per-model breakdown (`byModel`: model, provider, requests, total tokens, USD cost).
- **Dynamic Live Workspace Coaching Insights (`GET /api/analytics/insights`):**
  - Clean empty onboarding state when `totalCalls === 0` (zero hardcoded mock data).
  - Latest RED Escalation quote + highest escalation category hotspot (`topEscalationCategory`, `topEscalationRate%`).
  - Weakest Rep Dimension callout (`weakestDimension`, `weakestDimensionAvg`) + pill breakdown of `repProfessionalism`, `repEmpathy`, `repPatience`.
  - Commitment Deadline Grounding % (`deadlineGroundingPct%`).
- **Methodology & Weighting Reference Card:** Visual 40% Demeanor / 30% Compliance / 30% Action Grounding breakdown.

---

### G. Screen 5 — Admin Workspace Console (`admin` tab — `WorkspaceAdminView`, `ADMIN` only)
1. **Daily Token Quota Editor:** Update workspace daily budget (`PATCH /api/org/token-quota`, min `1,000`).
2. **Team Members & RBAC Manager:** List members (`GET /api/org/members`), invite/add teammate (`POST /api/org/members` with email, fullName, password, role), 1-click `ADMIN` <-> `MEMBER` role toggle (`PATCH /api/org/members/{id}/role`, prevents self-demotion of last admin).
3. **Signed Outbound Webhooks & Delivery Health:**
   - Register HTTPS webhook URLs (`POST /api/org/webhooks`) with SSRF validation (blocks `http://`, `localhost`, `169.254.169.254`, private RFC1918 IPs).
   - Subscribe to events: `call.completed`, `call.red_flag_detected`, `commitment.created`.
   - HMAC-SHA256 `X-Inflect-Signature` signing with masked secret preview (`whsec_...xxxx`), 3x exponential backoff retry, and `DELIVERED` / `DEAD_LETTER` delivery attempt inspector (`GET /api/org/webhooks/{id}/deliveries`).
4. **Immutable Workspace Audit Log:** Keyset-paginated compliance table (`GET /api/org/audit-logs`) logging actor email, timestamp, action badge (`CALL_DELETED`, `QUOTA_UPDATED`, `CACHE_CLEARED`, `TRANSCRIPT_EDITED`, `MEMBER_CREATED`, `MEMBER_ROLE_UPDATED`, `WEBHOOK_CREATED`, `WEBHOOK_DELETED`), target ID, and JSON metadata.

---

## 6. Technical Architecture, Scaling & Security Summary

| Pillar | Implementation Highlights |
| :--- | :--- |
| **Audio Pipeline & Large Files** | 5 MB streaming chunks up to 500 MB; magic-byte check on chunk 0; `SHA-256` tenant-scoped dedup; `imageio-ffmpeg` silence-aware 10-min windowing (`silencedetect`) with speaker-state continuity & overlap dedup; async `202` jobs + SSE `/events`; `HTTP 206` byte-range audio streaming. |
| **Database & Traffic Scale** | Neon PostgreSQL (`SQLAlchemy` ORM); composite indexes `(org_id, created_at, id)`; PostgreSQL `GIN` FTS index on `transcript_segments.text`; denormalized counters eliminating N+1 queries; SQL aggregations wrapped in `SingleFlightCache`; `TokenBucketRateLimiter`; `IdempotencyRecordModel`; DB-backed `CacheEntryModel` (Tier-1 transcript cache + Tier-2 full report cache with 7-day TTL + LRU). |
| **AI Resilience & Prompt Safety** | Gemini 2.0/2.5 Flash primary (`response_schema` with `transcript` first for grounded CoT); Groq Whisper `verbose_json` + Llama-3.3 fallback for >18 MB chunked audio; circuit breakers (`gemini_circuit`, `groq_circuit`); exponential backoff w/ jitter; `TokenUsageLedgerModel` cost tracking; 4-layer negative-prompt & injection defense. |
| **Security & Multi-Tenancy** | Salted `scrypt` password hashing; `HttpOnly` cookie JWTs + scoped media tokens; strict `org_id` tenant isolation across DB rows, caches, audio files & search; `ADMIN` vs `MEMBER` RBAC; SSRF protection on webhooks; security response headers & strict CORS. |
| **Deployment & Verification** | Docker Compose stack (`db` Postgres 16 + `backend` Uvicorn + `frontend` Nginx static + `nginx` reverse proxy w/ `10M` chunk limit & unbuffered SSE); CLI golden eval runner (`eval_golden.py`). |

---

## 7. API Endpoints Reference (For UI Integration Mapping)

- **Auth:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Uploads & Audio:** `POST /api/uploads/init`, `PUT /api/uploads/{id}/chunk/{idx}`, `POST /api/uploads/{id}/complete`, `GET /api/assets/{id}/stream`
- **Analysis Jobs:** `POST /api/analyze/async`, `GET /api/jobs/{id}`, `GET /api/jobs/{id}/events` (SSE), `POST /api/analyze` (sync compat)
- **History & Search:** `GET /api/history`, `GET /api/search/transcripts`, `GET /api/history/{id}`, `PATCH /api/history/{id}/transcript/{seg_id}`, `DELETE /api/history/{id}`
- **Commitments & Analytics:** `GET /api/commitments`, `PATCH /api/commitments/{id}`, `GET /api/analytics/overview`, `GET /api/analytics/insights`, `GET /api/org/token-quota`
- **Admin Workspace (`ADMIN`):** `PATCH /api/org/token-quota`, `DELETE /api/cache`, `GET /api/org/members`, `POST /api/org/members`, `PATCH /api/org/members/{id}/role`, `GET /api/org/audit-logs`, `GET /api/org/webhooks`, `POST /api/org/webhooks`, `DELETE /api/org/webhooks/{id}`, `GET /api/org/webhooks/{id}/deliveries`
- **Health:** `GET /api/health`

---

## 8. Constraints for UI Tools Generating Layouts / Wireframes

1. **Do NOT drop existing features:** Every interactive control above (upload chunk progress, `HTTP 206` speed/seek player, isolated customer frustration meter, inline transcript editing, `ConfigDrawer` 0-byte re-analysis, FTS spoken-snippet timestamp jump, token quota pill & UTC countdown, Admin RBAC/Webhook/Audit tables) must have an explicit, accessible place in the UI.
2. **Strict Color Discipline:**
   - **Day Mode:** Navy + Sand + Tangerine (`#0F1E36`, `#F5EFE6`/`#FCF9F4`, `#F97316`).
   - **Night Mode:** Charcoal + Dusty Purple + Gold (`#121116`, `#272134`/`#342C44`, `#E5B94E`).
3. **Unauthenticated Default:** `/` renders the **Landing Page** first; authentication is user-initiated via explicit **Sign In / Create Workspace** actions.
4. **Tech Compatibility:** All components must target **React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui + React Bits + Anime.js + Lucide Icons**.
