# Situational System Design: Large File Uploads & Lengthy Audio (1-Hour+ Calls)

> **Scope:** `Audio-QA-Tester` (`anb_office` branch) — React + TypeScript + FastAPI + Neon PostgreSQL + Gemini Multimodal.

---

## 1. The Problem Statement

A 1-hour sales call recording is typically **40–100 MB** (`.m4a`/`.mp3`) or **~600 MB** (`.wav`). Under the current architecture in `Audio-QA-Tester`, large and lengthy recordings fail across **4 distinct layers**:

1. **Client & Server Memory Limits (`UploadDropzone.tsx`, `main.py`, `audio_service.py`):**
   * The UI rejects files `> 25 MB`.
   * The backend executes `content = await file.read()` (loading the entire binary into RAM), copies it to a temp file, and re-reads it for fallback engines. Concurrent large uploads spike server RAM and trigger **OOM crashes**.
2. **Synchronous HTTP Timeouts (`App.tsx`, `main.py`):**
   * `POST /api/analyze` holds a single HTTP connection open through upload + Gemini File API polling + full inference (forcing a 300-second `AbortController` timeout and fake `setTimeout` UI steps). Reverse proxies (NGINX 60s, Cloudflare 100s) drop the request with **`504 Gateway Timeout`**.
3. **File API Polling & Ephemeral Playback (`audio_service.py`, `App.tsx`):**
   * `client.files.get()` only polls 15 times (`15s` max) and proceeds even if the file is not `ACTIVE`.
   * Audio URLs use `URL.createObjectURL(file)`, which vanishes on page refresh, and `handleReanalyze` re-uploads the entire audio file bytes over HTTP.
4. **Gemini Output Token Ceiling & Timestamp Drift (The 1-Hour AI Bottleneck):**
   * While 1 hour of audio (~115,200 input tokens at ~32 tokens/sec) fits inside Gemini's 1M input context window, prompting Gemini to return a **complete unabridged verbatim transcript** (~500–800 turns) plus tone analysis and action items in **one single JSON object** demands **20,000–35,000+ output tokens**.
   * This leads to **truncated/malformed JSON**, **timestamp drift** after ~15–20 minutes, and losing all progress if a transient `503` hits near the end.

---

## 2. Chosen Production-Grade Solution (`A2 + B2 + C3`)

We adopt a modular three-layer design that runs immediately on **FastAPI + Neon PostgreSQL** with zero extra external infrastructure, while keeping clean interfaces (`StorageProvider`, `JobQueue`) for seamless S3/Redis upgrades later:

```text
[React Client]
  ├─ 1. Compute SHA-256 hash in chunks (Web Crypto)
  ├─ 2. POST /api/uploads/init ──► Dedupe by SHA-256; get uploadId (or reuse existing assetId)
  ├─ 3. PUT /api/uploads/{uploadId}/chunk/{idx} (5 MB chunks, retry-per-chunk, real % bar)
  ├─ 4. POST /api/uploads/{uploadId}/complete ──► Verify size, SHA-256, magic bytes -> AudioAsset in Neon DB
  └─ 5. POST /api/analyze { assetId, config } ──► Returns 202 Accepted { jobId } instantly
          │
          ▼ (Real-time progress via SSE: GET /api/jobs/{jobId}/events)
[Background Async Worker + Neon PostgreSQL Job/Chunk Tables]
  ├─ Short audio (< 12 min): Single-pass Gemini with "transcript" FIRST + response_schema
  └─ Lengthy audio (≥ 12 min, e.g., 1 hr):
       ├─ A. Silence-Aware Split (imageio-ffmpeg silencedetect + segment) into ~10-min overlapping chunks
       ├─ B. Map: Gemini Multimodal per chunk (speaker continuity header + persisted AudioChunkResult)
       ├─ C. Merge: Shift timestamps by +chunk_start_seconds & deduplicate 5s overlap window
       └─ D. Reduce: Fast text evaluation for holistic tone, sentiment, commitments & forbidden-phrase guard
```

### Key Architectural Components
1. **Upload & Storage (`A2` — Chunked Resumable Upload behind `StorageProvider`):**
   * Raises upload limit from 25 MB → **500 MB** via **5 MB streaming chunks** with server-side `StorageProvider` abstraction (Local Disk today, S3/R2 drop-in later).
   * Streams persistent playback via `GET /api/assets/{assetId}/stream` supporting **HTTP `206 Partial Content` byte-range requests**.
2. **Async Execution & Live Telemetry (`B2` — Neon DB-Backed `AnalysisJob` + SSE):**
   * Decouples HTTP from processing: `POST /api/analyze` returns `202 Accepted { jobId }` in milliseconds.
   * React subscribes to `GET /api/jobs/{jobId}/events` (`EventSource`) for real progress (`Uploading Chunk 4/12`, `Transcribing Segment 3/6 (50%)`, `Synthesizing Final Report`).
3. **Lengthy Audio AI Pipeline (`C3` — Silence-Aware Map-Reduce with `imageio-ffmpeg`):**
   * Bundles a static `ffmpeg` binary via `imageio-ffmpeg` (`pip`) so zero manual OS installation is needed.
   * Short files (< 12 min) take the fast single-pass path (upgraded with `response_schema` and `"transcript"` first). Lengthy files (≥ 12 min) automatically use Map-Reduce.

---

## 3. All 10 Edge Cases Covered & How Each Is Solved

| # | Edge Case / Failure Mode | How Our Solution Solves It |
| :--- | :--- | :--- |
| **1** | **Server RAM OOM under large/concurrent uploads** | Backend never calls `await file.read()` on the whole file. React uploads **5 MB chunks**, and FastAPI streams each chunk (`64 KB` read buffers) straight to `StorageProvider` disk. Server heap stays flat (~10–20 MB) even for 500 MB+ files. |
| **2** | **NGINX / Cloudflare `504` timeouts & frozen UI** | `POST /api/analyze` enqueues an `AnalysisJob` in Neon DB and returns `202 Accepted { jobId }` immediately (< 50 ms). Processing runs asynchronously in the worker while SSE streams real status updates. |
| **3** | **Network drop mid-upload (flaky Wi-Fi / 4G)** | Each 5 MB chunk is uploaded and persisted independently (`PUT /chunk/{idx}`). Failed chunks automatically retry (3x with backoff), and React tracks completed chunk indices so partial progress isn't lost. |
| **4** | **Extension spoofing (`.exe` or `.html` renamed to `.m4a`)** | On Chunk `0` (and `/complete`), the backend reads the first few bytes and inspects **magic-byte file signatures** (`ftyp` ISO BMFF for `.m4a`/`.mp4`, `ID3`/`FF FB`/`FF F3` for `.mp3`, `RIFF....WAVE` for `.wav`, `OggS` for `.ogg`, `ADTS` for `.aac`) plus enforces strict server-side `MAX_UPLOAD_BYTES` (`500 MB`). |
| **5** | **Gemini output token limit & truncated JSON on 1-hr calls** | Splitting into ~10-minute chunks keeps each chunk's transcript under ~3,500 output tokens. Using Gemini's formal **`response_schema`** + placing `"transcript"` first prevents structural drift and JSON truncation. |
| **6** | **Timestamp drift & `<audio>` player desync** | **Critical:** We do *not* delete silences with `silenceremove` (which would shrink durations and desync transcript clicks from the original `<audio>` scrubber!). Instead, `ffmpeg silencedetect` finds natural pauses **only to pick split timestamps** (`-ss` / `-to`), and backend merging shifts every chunk's timestamps by its exact `start_offset_seconds`. |
| **7** | **Speaker label flipping (`Sales Rep` ↔ `Customer`) across chunks** | Chunk $i$ receives a compact **speaker continuity header** + the last 2 turns of Chunk $i-1$ (plus `repSpeakerId` config), anchoring who is `Sales Rep` vs `Customer` across every 10-minute boundary. |
| **8** | **Duplicate / cut-off dialogue in the 5-second chunk overlap** | Chunks overlap by 5 seconds around natural pauses so words are never sliced mid-syllable. During Merge, a deterministic deduplicator compares turns inside the overlap timestamp window (`diff`/`SequenceMatcher`) and merges/drops duplicates cleanly. |
| **9** | **Mid-call `503` failure, slow File API activation & leaked cloud files** | Each finished chunk is persisted in `AudioChunkResult` in Neon DB: if Chunk 5 of 6 fails, retrying the job **resumes from Chunk 5** without re-paying Gemini tokens for Chunks 1–4. File API polling uses exponential backoff up to **120s** (raising on `FAILED`), and `finally:` guarantees `client.files.delete()` + local temp cleanup. |
| **10** | **Audio lost on reload, wasted re-uploads & orphaned chunks** | `AudioAsset` persists the file on `StorageProvider`, served via `GET /api/assets/{id}/stream` (`206 Partial Content` range seeking for 1-hr scrubbing). Re-analyzing with new rubric rules sends `{ assetId, config }` (**0 bytes re-uploaded**). A cleanup sweeper purges abandoned `UPLOADING` sessions older than 2 hours. |

---

## 4. Other Possible Options & Why We Chose `A2 + B2 + C3`

### A. Upload & Storage Alternatives
* **Option A1 — Single-Request Streaming to Disk:** Simpler (1 endpoint), *rejected* because a network hiccup at 90% of a 300 MB upload forces restarting from 0%, and slow mobile uploads hit reverse-proxy request timeouts.
* **Option A3 — Direct S3 / Cloudflare R2 Presigned Multipart:** Best for multi-thousand-user cloud scale (0 bytes through FastAPI), *deferred* because it requires provisioning S3/R2 buckets, IAM keys, and CORS `ExposeHeaders: ["ETag"]` upfront. Our **`StorageProvider` abstraction** gives us A2 today and lets us plug in A3 later without rewriting controllers or React components.

### B. Async Queue & Progress Alternatives
* **Option B1 — Synchronous HTTP (`POST /api/analyze` waits):** *Rejected* because 1-hour Map-Reduce takes 45–120+ seconds, guaranteeing `504` timeouts behind proxies and zero resilience on refresh.
* **Option B3 — Redis + BullMQ/Celery/ARQ:** Best for multi-pod worker auto-scaling and global cross-pod rate limits, *deferred* because no Redis instance is running yet. Our **`JobQueue` abstraction** backed by Neon PostgreSQL (`AnalysisJob`) eliminates timeouts immediately with zero extra services and swaps cleanly to Redis in Phase 2 (High-Traffic Scaling).

### C. Lengthy Audio AI Alternatives
* **Option C1 — Single-Pass Full Audio to Gemini:** *Rejected* because 1 hour of verbatim JSON transcript exceeds safe output token limits, causes timestamp drift, and wastes 100% of tokens on any transient error.
* **Option C2 — Dedicated STT (`Whisper`/`Deepgram`) → Chunked Text LLM:** Great for pure transcription, *not chosen as primary* because converting speech to plain text **destroys acoustic tone** (sarcasm, raised voice, impatience, sighing)—which is the core value of Call Tone QA. (Groq Whisper+LLM remains available as a fast fallback!)

### D. Audio Splitting Tool Alternatives
* **System `ffmpeg` manual install:** Fragile across developer machines (`ffmpeg` is currently not on PATH).
* **Pure Python (`wave` / `pydub` without `ffmpeg`):** Cannot decode or split `.m4a` (AAC/MP4 container) or `.mp3` without FFmpeg.
* **`imageio-ffmpeg` (`pip` package):** Bundles a prebuilt static `ffmpeg` binary inside the Python `.venv` automatically—zero manual setup.

---

## 5. Required Inputs & Configuration Checklist

* **Already Configured in `backend/.env`:**
  * `GEMINI_API_KEY` ✅
  * `DATABASE_URL` (Neon PostgreSQL) ✅
* **Optional (Not Required for Core Implementation):**
  * `GROQ_API_KEY` — Only if you want to test Groq failover.
  * S3/R2 credentials (`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) — Only needed later if switching `StorageProvider` from local disk to cloud object storage.
