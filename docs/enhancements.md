# System Enhancements & Production Hardening Roadmap (`anb_office`)

This document captures the next set of architectural and product enhancements identified across `Audio-QA-Tester`. Each enhancement follows a structured **Problem → Proposed Solution → Before vs. After Impact** breakdown.

---

## Enhancement 1: Dynamic Team Coaching Insights & Granular `overall_score`

### 1. Problem & How It Affects the Situation
* **Static Mock Insights (`frontend/src/components/AnalyticsDashboard.tsx` lines 195–204):** The *"Automated Team Coaching Insights"* panel currently renders hardcoded text (*"Turn #5 in Call Sample 1 was cited for dismissive language..."*) regardless of which workspace is signed in or what calls were actually audited. New tenants with zero calls or clean calls still see fake violations.
* **Hardcoded `RED` Score (`backend/job_worker.py` lines 102–108):** Any `RED` verdict forces `overall_score = 2.4`, ignoring `sentimentBreakdown` (`repProfessionalism`, `repEmpathy`, `repPatience`). A borderline `RED` (average 62/100) looks identical in analytics to an overtly abusive call (average 15/100).

### 2. Solution Proposed
* Compute `overall_score` dynamically from the weighted Rep demeanor scores (`(repProfessionalism + repEmpathy + repPatience) / 300.0 * 5.0`), capped cleanly below `3.0` on `RED` so severity differences remain visible while `RED` still clearly signals non-compliance.
* Add `GET /api/analytics/insights` (tenant-scoped SQL aggregation) computing:
  * Weakest sentiment dimension across recent calls (e.g., `Patience` averaging `61/100`)
  * Top escalation category (e.g., `Financial Recovery` with highest `RED` rate)
  * Latest real `RED` evidence quote (with `callId` + timestamp) and real commitment deadline grounding rate.
* Replace the static coaching strings in `AnalyticsDashboard.tsx` with these live tenant metrics (showing a clean empty state if 0 calls exist).

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Every workspace saw static sample text referencing *"Call Sample 1"*, and all `RED` calls collapsed to `2.4 / 5.0` with zero distinction between mild impatience and severe hostility.
* **After this change:** Every manager sees live, org-isolated coaching insights driven by real calls in Neon PostgreSQL, and `overall_score` reflects true call severity for accurate coaching prioritization.

---

## Enhancement 2: Persistent Human-in-the-Loop Transcript Corrections

### 1. Problem & How It Affects the Situation
* In `frontend/src/App.tsx` (`handleUpdateTranscriptSegment`) and `TranscriptViewer.tsx` (`saveEdit`), clicking the edit icon to fix a speaker label (`Sales Rep` ↔ `Customer`) or correct a misheard Hindi/Hinglish word **only updates React local memory**.
* **Impact:** Refreshing the browser or reopening the call from **Call History** silently discards every human correction. Worse, running **Re-Analyze** continues reading the original unedited Tier-1 transcript cache (`CacheEntryModel`), repeating the same speaker-attribution mistakes.

### 2. Solution Proposed
* Add `PATCH /api/history/{call_id}/transcript/{segment_id}` (tenant-scoped via `org_id`) to persist updated `text`, `speaker`, and `is_rep` directly into `TranscriptSegmentModel`.
* Automatically synchronize the updated transcript array into the tenant's **Tier-1 Audio Base Cache** (`save_audio_base_cache`) and invalidate stale Tier-2 / analytics caches.
* Update `App.tsx` `handleUpdateTranscriptSegment` to call this `PATCH` endpoint optimistically (rolling back or surfacing an error if it fails) and expose a quick **"Re-Analyze with Corrected Transcript"** action.

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Reviewer fixes vanished on reload and never influenced AI re-evaluation.
* **After this change:** Every human transcript/diarization correction is permanently persisted in PostgreSQL, survives reloads, and immediately feeds into ~300ms Tier-1 re-analysis.

---

## Enhancement 3: PostgreSQL Full-Text Search Across Spoken Transcripts

### 1. Problem & How It Affects the Situation
* In `backend/main.py`, `GET /api/history?search=...` executes `ILIKE '%term%'` across only `filename`, `headline`, and `category`.
* **Impact:**
  1. Leading-wildcard `ILIKE '%...'` cannot use standard B-Tree indexes, degrading into full sequential table scans at 100k+ records.
  2. Managers cannot search for **words actually spoken inside calls** (e.g., `"refund"`, `"discount"`, `"khajoor"`, `"cancel"`).

### 2. Solution Proposed
* Add a PostgreSQL **`TSVECTOR`** search index (`GIN` index via migration in `database.py`, with graceful `ILIKE` fallback if running on SQLite) across `transcript_segments.text` and `call_audits` summary fields.
* Add `GET /api/search/transcripts?q=...&limit=...` (tenant-scoped + keyset/rank-ordered) returning matching calls along with the **exact matching transcript snippets, speaker, and jump-to timestamps**, plus integrate transcript-content matching into `/api/history?search=...`.
* Upgrade `CallHistoryView.tsx` to display matching spoken snippets directly in search results and open the call at the matched timestamp.

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Searching `"discount"` only matched if `"discount"` happened to be in the filename or 1-line headline, and scanned rows linearly.
* **After this change:** Searching any spoken keyword scans an indexed `GIN` inverted index in milliseconds and jumps straight to the exact turn and audio timestamp.

---

## Enhancement 4: Admin Workspace Management Panel & Audit Trail

### 1. Problem & How It Affects the Situation
* Although the backend enforces `ADMIN` vs `MEMBER` RBAC and exposes `PATCH /api/org/token-quota`, **there is no UI or endpoint** for an `ADMIN` to create/manage `MEMBER` users in their workspace or adjust their `daily_token_limit` without `curl`.
* Destructive or sensitive actions (`DELETE /api/history/{id}`, `DELETE /api/cache`, `PATCH /api/org/token-quota`) leave **no immutable audit trail** showing who performed the action and when.

### 2. Solution Proposed
* Add **`AuditLogModel`** (`id`, `org_id`, `actor_user_id`, `actor_email`, `action`, `target_id`, `metadata_json`, `created_at`) recording user creation, role updates, quota updates, audit deletions, and cache clears.
* Add Admin endpoints (`require_admin`):
  * `GET /api/org/members`, `POST /api/org/members` (create/add member inside the same `org_id`), `PATCH /api/org/members/{user_id}/role`
  * `GET /api/org/audit-logs` (cursor-paginated)
* Add a clean **Workspace Admin** tab/drawer section visible to `ADMIN` users in React (`WorkspaceAdminView.tsx`) to manage members, update `daily_token_limit` live, and inspect the audit trail.

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Only 1 user existed per registered org, quota updates required raw API calls, and deletions left no accountability trail.
* **After this change:** Admins manage team members, adjust daily token budgets directly from the UI, and have a full compliance audit trail.

---

## Enhancement 5: Event-Driven Webhooks & Escalation Alerts (w/ Retry & DLQ)

### 1. Problem & How It Affects the Situation
* Currently, analysis results only appear when a user actively polls or watches the browser SSE tab.
* **Impact:** When a 1-hour recording finishes in the background with a `RED` violation or new customer commitments, external systems (Slack escalation channels, HubSpot/Salesforce CRMs) receive **zero automatic notifications**.

### 2. Solution Proposed
* Add **`WebhookEndpointModel`** (`id`, `org_id`, `url`, `secret`, `events`, `is_active`) and **`WebhookDeliveryModel`** (`id`, `endpoint_id`, `event_type`, `payload_json`, `status`: `PENDING|DELIVERED|DEAD_LETTER`, `attempts`, `last_error`, `next_retry_at`).
* Dispatch signed **`X-Inflect-Signature` (`HMAC-SHA256`)** webhooks asynchronously from `job_worker.py` on `call.completed`, `call.red_flag_detected`, and `commitment.created` with exponential backoff (up to 3 attempts before moving to `DEAD_LETTER`).
* Add `GET/POST/DELETE /api/org/webhooks` (`require_admin`) + delivery log visibility in the Workspace Admin UI.

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Background completions were silent outside the browser UI, requiring manual CSV exports or tab polling.
* **After this change:** Critical `RED` flags and commitments push automatically to Slack/CRMs with cryptographic HMAC verification and resilient retries.

---

## Enhancement 6: Docker + NGINX Production Packaging & Golden Eval Harness

### 1. Problem & How It Affects the Situation
* **Deployment Gap:** There is no `Dockerfile`, `docker-compose.yml`, or `nginx.conf`. Placing a default NGINX reverse proxy in front of `Audio-QA-Tester` breaks **two critical features we built**:
  1. NGINX defaults to `client_max_body_size 1m` (rejects our 5 MB upload chunks with `413`).
  2. NGINX buffers upstream responses by default (stalling `/api/jobs/{id}/events` SSE progress until the stream closes!).
* **AI Regression Gap:** There is no automated **Golden Eval Runner** to verify accuracy/latency/cost against `backend/sample_audio/*.m4a` whenever prompts or Gemini models change.

### 2. Solution Proposed
* Add `backend/Dockerfile`, `frontend/Dockerfile`, root `docker-compose.yml` (wiring frontend + backend + NGINX), and `nginx/nginx.conf` with:
  * `client_max_body_size 10M` on `/api/uploads/`
  * `proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s;` on `/api/jobs/*/events`
* Add `backend/eval_golden.py` CLI script running against labeled golden sample calls (`test_call_green.m4a`, `test_call_red.m4a`, `test_call_multilingual.m4a`) outputting precision/accuracy (`GREEN`/`RED`), latency, and token cost summary.

### 3. Change & How It Differs From the Affected Situation Back Then
* **Back then:** Deploying behind NGINX broke SSE and 5 MB chunks silently, and prompt changes had no repeatable accuracy/cost benchmark.
* **After this change:** One `docker compose up` launches a proxy-safe production stack, and `eval_golden.py` gives repeatable quality/cost benchmarks before every release.
