# Situational System Design: Heavy Traffic, Database Scale & Worker Resilience

> **Scope:** `Audio-QA-Tester` (`anb_office` branch) — React + TypeScript + FastAPI + Neon PostgreSQL.

---

## 1. The Problem Statement

While `Audio-QA-Tester` now handles chunked uploads and 1-hour calls, under **heavy concurrent traffic (100+ users, burst uploads) and large historical datasets (100,000+ audited calls & millions of transcript segments)**, the platform hits **6 severe scalability bottlenecks**:

1. **Analytics OOM Crash (`main.py` `/api/analytics/overview`):**
   * Executes `audits = db.query(CallAuditModel).all()`, pulling **every row and JSON blob** (`sentiment_breakdown`, `evidence_quotes`, `etiquette_notes`) into Python RAM just to compute `sum(a.overall_score) / total_calls`. At 100k+ rows, this spikes memory and crashes the API container.
2. **N+1 Lazy-Loading Queries (`main.py` `/api/history`):**
   * Loads 100 `CallAuditModel` rows and then evaluates `len(a.commitments)` and `len(a.transcripts)` inside a Python loop—firing **`1 + 2N` = 201 SQL queries** per page load.
3. **Unbounded Queries & Missing Cursor Pagination (`main.py` `/api/commitments`, `/api/history`):**
   * `/api/commitments` calls `.all()` with zero limit, returning tens of thousands of rows at once.
   * `/api/history` lacks keyset/cursor pagination and composite indexes for `(tone_rating, created_at, id)`.
4. **Duplicate DB Inserts on Cache Hit & Duplicate Job Spawns (`main.py`, `job_worker.py`):**
   * Re-analyzing a cached file inserts a **brand-new `CallAuditModel` row** every time, artificially inflating `totalCalls`, `redFlagCount`, and Call History.
   * Clicking "Analyze" twice or retrying on flaky 4G spawns duplicate `AnalysisJob` runs without an **`Idempotency-Key`**.
5. **Non-Shared Local Disk Cache Without TTL or Eviction (`cache_service.py`):**
   * `backend/cache/*.json` grows unboundedly on local disk, has no file locks, and fails completely behind a load balancer with 2+ API instances.
6. **In-Memory Background Tasks Lost on Restart (`main.py` `asyncio.create_task`):**
   * If Uvicorn restarts mid-job, `AnalysisJobModel` rows stay stuck in `QUEUED` / `TRANSCRIBING` forever with no startup recovery sweeper or concurrency limiter.

---

## 2. Chosen Production-Grade Solution (`PostgreSQL-Native Scale + Abstraction Layers`)

We harden the database, caching, rate-limiting, and worker layers using **Neon PostgreSQL + in-process/DB primitives** behind clean interfaces (`CacheProvider`, `RateLimiter`, `JobQueue`), requiring **zero extra paid infrastructure** today while staying 100% ready to swap in Redis later:

```text
[React Client]
  ├─ Sends Idempotency-Key header on POST /api/analyze/async
  ├─ Uses centralized API_BASE_URL across History, Commitments, Analytics
  └─ Uses cursor-paginated "Load More" for History & Commitments
          │
          ▼
[FastAPI Control Plane]
  ├─ 1. Sliding-Window / Token-Bucket Rate Limiter (per IP/client, 429 + Retry-After)
  ├─ 2. Idempotency Guard (deduplicates concurrent/repeated POSTs via DB/cache key)
  ├─ 3. Bounded Async Job Semaphore (caps concurrent AI workers so DB/CPU never melt)
  └─ 4. Startup Stale-Job Recovery (marks/re-queues orphaned jobs on server boot)
          │
          ▼
[Neon PostgreSQL (Indexed + SQL Aggregations)]
  ├─ CallAuditModel: pre-computed turns_count & commitments_count + cache_key dedupe
  ├─ /api/history: Keyset Cursor Pagination + composite index (created_at DESC, id DESC)
  ├─ /api/commitments: Cursor Pagination + bounded limit
  ├─ /api/analytics/overview: Single SQL AVG/COUNT/CASE query + 60s single-flight cache
  └─ CacheProvider: DB/TTL-aware Tier-1 & Tier-2 cache (LRU + TTL cleanup, Redis-swappable)
```

### Key Architectural Components
1. **SQL-Side Analytics & Denormalized Counters:** Replace Python `.all()` with SQL `func.count()`, `func.avg()`, and `case()` expressions; store `turns_count` and `commitments_count` directly on `CallAuditModel` at write time (eliminating 200 extra queries per History request).
2. **Keyset Cursor Pagination + Composite Indexes:** Replace unbounded `.all()` and offset scans with `(created_at, id)` cursor pagination backed by composite indexes.
3. **Cache Deduplication & Bounded TTL `CacheProvider`:** Store `cache_key` / upsert or reuse existing `CallAuditModel` on Tier-2 hits (or add an `is_cached_replay` / unique constraint strategy), add TTL + max-entry eviction to cache entries, and put cache behind a `CacheProvider` interface (Neon DB / bounded disk today, Redis tomorrow).
4. **Idempotency Keys, Rate Limiting & Worker Concurrency Cap:** Prevent triple-click duplicate jobs, cap per-client request bursts (`429`), cap concurrent background AI jobs via `asyncio.Semaphore` + DB queue polling, and recover orphaned jobs on startup.

---

## 3. All 10 Edge Cases Covered & How Each Is Solved

| # | Edge Case / Failure Mode | How Our Solution Solves It |
| :--- | :--- | :--- |
| **1** | **Analytics OOM at 100k+ calls** | `GET /api/analytics/overview` runs **one SQL aggregation query** (`COUNT`, `AVG`, `SUM(CASE WHEN ...)`) directly inside PostgreSQL—transferring ~100 bytes instead of 500 MB of rows into Python RAM. |
| **2** | **N+1 query storm in Call History** | Denormalized `turns_count` and `commitments_count` columns on `call_audits` (backfilled on startup) reduce 201 queries per 100 rows down to **1 single query**. |
| **3** | **Deep pagination slowdown & duplicate/skipped rows** | Keyset cursor pagination `(created_at < cursor_dt) OR (created_at == cursor_dt AND id < cursor_id)` stays $O(\log N)$ on page 10,000 and handles identical timestamps without skipping or duplicating rows. |
| **4** | **Commitments Board browser/API freeze** | `/api/commitments` enforces cursor pagination (`limit <= 100`) instead of `.all()`, keeping response payloads tiny. |
| **5** | **Cache Stampede on Analytics Dashboard** | When 500 managers refresh Analytics simultaneously at 9:00 AM, a **single-flight lock** ensures only 1 request runs the SQL aggregation while the other 499 wait on the cached 60s snapshot. |
| **6** | **Inflated metrics from Tier-1/Tier-2 cache hits** | On a Tier-2 cache hit (`{audio_hash}_{config_hash}`), the API returns the existing `CallAuditModel` (and updates `updated_at`/returns existing `callId`) instead of inserting duplicate audit rows for identical analyses. |
| **7** | **Double-click / mobile retry creating duplicate jobs** | Client sends a deterministic `Idempotency-Key` header (`POST /api/analyze/async`); backend checks an `idempotency_records` table/cache and returns the already-created `jobId` instead of spawning a second AI run. |
| **8** | **Traffic burst exhausting DB connections or Gemini RPM** | Token-bucket rate limiter returns `429 Too Many Requests` + `Retry-After` on abusive bursts, and an `asyncio.Semaphore` + queued DB dispatcher caps concurrent running jobs to a safe limit (e.g., `MAX_CONCURRENT_JOBS = 4`). |
| **9** | **Server crash / deploy killing in-flight jobs** | On FastAPI lifespan startup, any `AnalysisJobModel` left in `QUEUED` / `SPLITTING` / `TRANSCRIBING` / `MERGING` / `REDUCING` from a prior crashed process is automatically re-queued (resuming from saved `AudioChunkResultModel` chunks!) or marked `FAILED` if stale beyond TTL. |
| **10** | **Unbounded local `backend/cache/` disk bloat** | Cache entries get a **TTL (`7 days`)** and max capacity cap (`LRU` eviction sweeps oldest files), plus `CacheProvider` abstracts storage cleanly to Neon DB / Redis so multi-instance deployments share state. |

---

## 4. Other Possible Options & Why We Chose This Design

### A. Caching & Rate-Limiting Backend
* **Option 1 — Keep Local Disk JSON Cache (`backend/cache/*.json`):** *Rejected* because it grows forever, has no race locking, and breaks horizontally when running 2+ instances.
* **Option 2 — Require Redis + BullMQ / Celery Immediately:** Best at massive scale (>1,000 req/s), *deferred* because no Redis instance is provisioned yet in this free-tier setup. Putting `CacheProvider` and `RateLimiter` behind interfaces backed by Neon PostgreSQL + bounded in-memory TTL gives multi-instance consistency right now and swaps to Redis via env var later.

### B. Analytics Scaling
* **Option 1 — Compute in Python via `.all()` or Chunked SQLAlchemy Yield:** *Rejected*—still pulls megabytes across the network from Neon DB.
* **Option 2 — Materialized Views / Separate ClickHouse Warehouse:** Overkill until tens of millions of rows; SQL `AVG()`/`COUNT()` + 60s single-flight cache handles millions of rows in < 30 ms.

### C. Pagination Strategy
* **Option 1 — `OFFSET` / `LIMIT` (`?page=500`):** *Rejected* because PostgreSQL scans and discards all skipped rows, degrading linearly with depth.
* **Option 2 — Keyset Cursor Pagination:** Constant-time index lookup at any depth.

---

## 5. Required Inputs & Configuration Checklist

* **Already Configured in `backend/.env`:**
  * `DATABASE_URL` (Neon PostgreSQL) ✅
* **Optional (Zero Setup Required Now):**
  * `REDIS_URL` — Only needed later when upgrading `CacheProvider` / `RateLimiter` / `JobQueue` from Neon DB to Redis.
