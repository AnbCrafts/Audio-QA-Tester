# Inflect — Call Quality & Conversation Intelligence Platform
### Multi-Tenant Voice QA, Tone Isolation & Commitment Auditing Engine

An intelligent, multi-business web application that processes `.m4a` sales call recordings, performs speaker diarization (separating Representative from Customer), evaluates the sales representative's tone with evidence-grounded citations, extracts concrete commitments without hallucinating deadlines, and provides an in-app configurability panel for multiple industry domains.

---

## 🎯 Core Capabilities & Rubric Alignment

| Evaluation Area | Weight | Implementation Details |
| :--- | :---: | :--- |
| **Accuracy & Reliability** | **40%** | • **Isolated Representative Scoring**: Customer emotion is separated so representative is never unfairly penalized.<br>• **Evidence Grounding**: Every RED/GREEN verdict cites direct quotes with timestamps from the transcript.<br>• **Hallucination Prevention**: Commitments only include explicit promises; unstated deadlines remain `null` rather than fabricated.<br>• **Dual-Engine Resilience**: Primary multimodal processing via Gemini with automatic fallback to Groq (Llama-3.3) for rate-limit resilience. |
| **User Experience (UX)** | **30%** | • **Interactive Call Player**: Synced audio scrubber with playback speed controls (1x, 1.25x, 1.5x, 2x).<br>• **Clear Visual Hierarchy**: High-contrast RED / GREEN pill badges and multi-dimensional sentiment meters.<br>• **Historical Call Explorer**: Searchable database of all past audited calls with 1-click reload.<br>• **Commitment Lifecycle Board**: Interactive status tracking (`PENDING` ➔ `COMPLETED`) with CSV export.<br>• **Team Analytics**: Aggregated quality scores, escalation rates, and coaching insights. |
| **Configurability** | **30%** | • **Multi-Business Presets**: Switch instantly between *B2B SaaS Sales*, *Financial Recovery / Debt Collection*, *Real Estate & Advisory*, and *Custom Rubric* without changing code.<br>• **Sensitivity Slider**: Choose between `Low`, `Balanced`, and `Strict` flag thresholds.<br>• **Action Item Scope**: Configurable from strict time-bound commitments to broad next steps.<br>• **Zero-Reupload Fast Re-Analysis**: Re-evaluates cached calls against updated rubrics in ~350ms. |

---

## 🗄️ Database & Persistence Layer

The platform includes a production **SQLAlchemy ORM layer**:
* **Default Setup (Zero Config):** Automatically creates a local SQLite database (`inflect.db`) with relational models for `CallAuditModel`, `TranscriptSegmentModel`, and `CommitmentModel`.
* **PostgreSQL / Cloud DB Ready:** To connect to Supabase, Neon, or AWS RDS, simply set `DATABASE_URL` in `backend/.env`:
  ```env
  DATABASE_URL=postgresql://user:password@host:5432/dbname
  ```

---

## 🏗️ Architecture

```
                       ┌─────────────────────────┐
                       │     React Frontend      │
                       │   (Vite + Tailwind CSS) │
                       │    Runs on Port 3000    │
                       └────────────┬────────────┘
                                    │
                         Upload .m4a audio +
                         Custom Config JSON
                                    │
                                    ▼
                       ┌─────────────────────────┐
                       │     FastAPI Backend     │
                       │    Runs on Port 8000    │
                       └────────────┬────────────┘
                                    │
               ┌────────────────────┴────────────────────┐
               ▼                                         ▼
   ┌───────────────────────┐                 ┌───────────────────────┐
   │ Primary: Gemini 2.0   │                 │ Fallback: Groq        │
   │ Multimodal Audio STT, │  (On rate limit)│ Llama-3.3-70B         │
   │ Diarization & Tone    │ ──────────────> │ Fast Reasoning &      │
   │ Structured Extraction │                 │ Structured Output     │
   └───────────────────────┘                 └───────────────────────┘
```

---

## ⚡ System Design & Production Scaling (`anb_office`)

To scale `Audio-QA-Tester` from a single-user prototype to a multi-tenant, production-resilient platform capable of handling **500 MB / 1-hour+ recordings, heavy traffic spikes, AI outages, and strict tenant quotas**, the following architectural upgrades were engineered:

| System Design Issue | What Was Implemented to Solve It | Key Modules & Design Spec |
| :--- | :--- | :--- |
| **1. Large File Uploads & 1-Hour+ Audio Processing** | • **5 MB Chunked Resumable Uploads** (`POST /api/uploads/init` → `PUT /chunk/{idx}` → `/complete`) up to **500 MB** with streaming disk I/O (zero full-file RAM buffering) and incremental browser `SHA-256` deduplication (`uploadClient.ts`).<br>• **Magic-Byte Signature Verification** on Chunk `0` (blocks renamed `.exe`/`.html`/`.pdf`).<br>• **HTTP `206 Partial Content` Range Streaming** (`/api/assets/{id}/stream`) for persistent `<audio>` scrubbing across reloads (`HH:MM:SS` supported) and **0-byte re-upload re-analysis** via `assetId`.<br>• **Async Job Worker (`202 Accepted`) + SSE Progress** (`/api/jobs/{id}/events`) eliminating 60s–300s HTTP timeouts.<br>• **Silence-Aware 10-Min Map-Reduce Pipeline** (`imageio-ffmpeg` `silencedetect`) with speaker continuity prompts, timestamp offset preservation, overlap deduplication, and per-chunk DB checkpoints (`AudioChunkResultModel`). | [docs/largeFileUpload.md](docs/largeFileUpload.md)<br>`backend/storage_service.py`<br>`backend/audio_chunker.py`<br>`backend/job_worker.py`<br>`frontend/src/utils/uploadClient.ts` |
| **2. Heavy Traffic, Database Scale & Worker Resilience** | • **SQL-Side Analytics Aggregations** (`func.count`, `func.avg`, `case()`) wrapped in a **30s Single-Flight Cache** to eliminate full-table Python `.all()` OOM crashes & cache stampedes.<br>• **Zero N+1 & Keyset Cursor Pagination** on `/api/history` and `/api/commitments` using denormalized `turns_count` / `commitments_count` and composite `(created_at, id)` indexes.<br>• **Shared DB-Backed Cache (`CacheEntryModel`)** with 7-day TTL + LRU eviction, plus `cache_key` deduplication so cache hits never inflate Call History.<br>• **Token-Bucket Rate Limiter**, **`Idempotency-Key` Guard** (`IdempotencyRecordModel`), bounded worker concurrency (`MAX_CONCURRENT_JOBS` semaphore), and **startup orphaned-job recovery**. | [docs/heavyTrafficAndScale.md](docs/heavyTrafficAndScale.md)<br>`backend/traffic_guard.py`<br>`backend/cache_service.py`<br>`backend/models.py` |
| **3. AI Rate Limits, Token/Cost Engineering & Fallback Integrity** | • **Resilient AI Gateway:** Exponential backoff with full jitter on transient `429`/`5xx`, fast-fail on `400`/`401`/`403`, and per-provider **Circuit Breakers** (`gemini_circuit`, `groq_circuit` surfaced on `/api/health`).<br>• **Token Telemetry & Guardrails:** Pre-flight token estimation, `max_output_tokens` caps, native Gemini `response_schema` with `transcript` **FIRST** (grounded CoT), and `TokenUsageLedgerModel` tracking exact input/output/cached tokens and USD cost.<br>• **Repaired Groq Fallback:** Chunks files `> 18 MB`, removes hardcoded Hindi grocery prompt bias, and preserves real Whisper `verbose_json` segment timestamps.<br>• **Prompt-Injection Isolation & Deterministic Guards:** `<CONFIG_RUBRIC>` / `<UNTRUSTED_TRANSCRIPT>` delimiters + deterministic post-LLM check for `customForbiddenPhrases`. | [docs/aiResilienceAndTokens.md](docs/aiResilienceAndTokens.md)<br>`backend/ai_gateway.py`<br>`backend/audio_service.py`<br>`backend/prompts.py` |
| **4. Authentication, Multi-Tenancy & Per-Tenant Daily Token Quotas** | • **Workspace Multi-Tenancy (`org_id`):** Every asset, job, cache key, audit, commitment, and token record is strictly isolated by `org_id` (`OrganizationModel`, `UserModel`).<br>• **Salted `scrypt` Auth & RBAC:** `HttpOnly` cookie JWTs + scoped short-lived `media_token`s for `<audio>` streaming, `ADMIN` vs `MEMBER` role checks, strict `CORS_ALLOWED_ORIGINS`, and security headers.<br>• **Per-Tenant Daily Token Quota & Next-Day Renewal:** Tracks each workspace's daily UTC token usage against `daily_token_limit` (default `500,000`/day), displays live usage & renewal countdown in the Navbar & Analytics Dashboard, and enforces `429 DAILY_QUOTA_EXCEEDED` (`Retry-After`) until automatic renewal at `00:00 UTC`. | [docs/securityAndAuth.md](docs/securityAndAuth.md)<br>`backend/auth_service.py`<br>`frontend/src/components/AuthModal.tsx`<br>`frontend/src/components/AnalyticsDashboard.tsx` |

### 🧪 Verification Test Suites
Run all backend unit/integration tests and the frontend build:
```powershell
cd backend
.\.venv\Scripts\python.exe test_database.py
.\.venv\Scripts\python.exe -m pytest test_large_audio_pipeline.py test_plans_2_3_4.py -v

cd ..\frontend
npm run build
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** v18+ and **npm**
- **Python** 3.10+
- An API Key from [Google AI Studio](https://aistudio.google.com/) (Gemini - Free) and/or [Groq](https://console.groq.com/) (Fallback - Free)

---

### 2. Backend Setup (FastAPI)

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows PowerShell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure your `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```
   Add your keys in `backend/.env`:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   ```

5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *API documentation will be available at: http://localhost:8000/docs*

---

### 3. Frontend Setup (React)

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Vite dev server:
   ```bash
   npm run dev
   ```
   *Open your browser at: http://localhost:3000*

---

## 🧪 Representative Test Calls Included

The repository includes representative sample call recordings for local validation:
1. **GREEN Call (Compliant)**:
   * *Scenario*: A high-pressure B2B SaaS discovery call where the customer raises acute Q3 budget freeze objections.
   * *Outcome*: Representative maintains active listening, validates budget constraints without defensiveness, offers a phased 15-seat pilot, and commits to an itemized proposal by 3 PM the following day.
2. **RED Call (Violation)**:
   * *Scenario*: A technical onboarding inquiry regarding API rate-limits.
   * *Outcome*: Representative interrupts, insults customer team competency (*"if your engineering team can't understand basic webhook documentation, no vendor can help you"*), and gives a hostile take-it-or-leave-it ultimatum.

---

## 🔒 Security & Best Practices
- **Server-Side API Keys**: Private keys (`GEMINI_API_KEY`, `GROQ_API_KEY`) are kept strictly on the backend and never exposed to the client bundle.
- **Strict Pydantic Schemas**: Backend responses are validated through Pydantic models to guarantee valid JSON formatting and type safety.
- **CORS Restricted**: API endpoints only accept requests from trusted frontend origins.

---

## 📄 License
MIT License. Built as a production multi-tenant Call Intelligence & QA platform.
