# Situational System Design: AI Rate Limits, Token Engineering & Fallback Integrity

> **Scope:** `Audio-QA-Tester` (`anb_office` branch) — React + TypeScript + FastAPI + Neon PostgreSQL + Gemini / Groq.

---

## 1. The Problem Statement

When processing concurrent calls—especially 1-hour recordings that fan out into 6+ Gemini requests each—calling AI SDKs directly without token accounting or resilience breaks reliability and cost control:

1. **No Exponential Backoff w/ Jitter or Circuit Breaker (`audio_service.py`):**
   * Under traffic bursts, Gemini returns `429 Too Many Requests` or `503 Service Unavailable`. Without jittered backoff on transient errors and a shared **Circuit Breaker**, every concurrent chunk keeps hammering a degraded provider until timeouts pile up.
2. **Zero Token Estimation, Output Caps, or Cost Telemetry (`audio_service.py`):**
   * The backend never checks `response.usage_metadata` (`prompt_token_count`, `candidates_token_count`, cached tokens), never stores USD spend per call/job in Neon PostgreSQL, never sets `max_output_tokens`, and has no daily/monthly token budget cap to stop runaway spend.
3. **Broken Groq Fallback Path (`_call_groq` in `audio_service.py`):**
   * Still executes `file.read()` (whole file in RAM) and fails on files > 25 MB (Groq Whisper's upload cap) because it has no chunking support.
   * Hardcodes a Hindi grocery prompt (`"Boliye, khajoor, bada dana, chota dana..."`) for **all** calls, biasing Whisper's acoustic decoder even on English B2B SaaS calls.
   * Requests `response_format="verbose_json"` from Whisper and then **discards `segments` timestamps** via `getattr(transcription, "text", ...)`, forcing an LLM to hallucinate timestamps (`"00:00", "00:04"`).
4. **Prompt Injection & Unbounded Config Strings (`prompts.py`, `audio_service.py`):**
   * Legacy single-pass & Groq paths interpolate `toneCriteria` and raw transcripts without `<UNTRUSTED_TRANSCRIPT>` delimiters or max-length limits on user inputs.
5. **No Model Routing / Confidence Escalation:**
   * No structured telemetry comparing latency, failure rate, and confidence between `gemini-flash-latest`, `gemini-flash-lite-latest`, and Groq.

---

## 2. Chosen Production-Grade Solution (`Resilient AI Gateway + Token Ledger + Fixed Groq Fallback`)

We introduce a dedicated **`ai_gateway.py`** resilience & token-accounting layer used across single-pass Gemini, 1-hour Map-Reduce chunks, Reduce synthesis, and a repaired Groq fallback:

```text
[Worker / Analysis Request]
  │
  ├─► 1. Pre-Flight Token & Budget Guard (TokenBudgetService)
  │      ├─ Estimate input tokens (audio seconds * 35 OR char/4 text estimate)
  │      └─ Check daily/monthly usage in Neon DB (token_usage_ledger) vs cap
  │
  ├─► 2. Circuit Breaker + Retry w/ Full Jitter (ai_gateway.py)
  │      ├─ Retry ONLY transient 429 / 500 / 502 / 503 / 504 / timeouts (never 400/401/403!)
  │      └─ Open Circuit for 60s after 5 consecutive failures -> instant failover to Groq
  │
  ├─► 3. Provider Adapters (with max_output_tokens & prompt isolation)
  │      ├─ Primary: Gemini Flash / Flash-Lite (native response_schema)
  │      └─ Repaired Groq Fallback:
  │           ├─ Splits > 20 MB audio via audio_chunker
  │           ├─ Language/preset-aware Whisper prompt (no hardcoded Hindi grocery bias!)
  │           └─ Preserves real Whisper verbose_json segment timestamps!
  │
  └─► 4. Post-Call Token Telemetry & Escalation
         ├─ Extract real usage_metadata -> insert TokenUsageLedger row + USD cost
         └─ Optional confidence gate: escalate low-confidence (< 65) short runs
```

### Key Architectural Components
1. **Exponential Backoff + Full Jitter & Circuit Breaker:** Prevents retry storms during `429`/`503` spikes and immediately bypasses an unhealthy provider for 60s after repeated failures.
2. **Token Telemetry & Budget Guardrails (`TokenUsageLedgerModel`):** Estimates tokens pre-flight, enforces `max_output_tokens`, captures real `usage_metadata` (input, output, cached, total tokens, USD cost) per job/call, and enforces configurable daily/monthly token limits.
3. **Repaired Groq Fallback (`_call_groq`):** Streams/chunks files > 20 MB, removes the hardcoded Hindi grocery Whisper prompt bias, and preserves Whisper `verbose_json` segment timestamps instead of letting the LLM invent `"00:00", "00:04"`.
4. **Prompt Injection Isolation & Config Bounds:** Bounds `toneCriteria` / `customForbiddenPhrases` lengths in Pydantic (`schemas.py`) and wraps untrusted dialogue in `<UNTRUSTED_TRANSCRIPT>` delimiters across all engines.

---

## 3. All 10 Edge Cases Covered & How Each Is Solved

| # | Edge Case / Failure Mode | How Our Solution Solves It |
| :--- | :--- | :--- |
| **1** | **Thundering herd retry storm on `429` / `503`** | Retry helper uses **exponential backoff with full jitter** (`random(0, min(cap, base * 2^attempt))`), spreading retries across time instead of slamming the API simultaneously. |
| **2** | **Wasted latency retrying permanent `400`/`401`/`403` errors** | Error classifier distinguishes **retryable** (`429`, `5xx`, timeout) from **non-retryable** (`400`, `401`, `403`, invalid API key) errors—failing fast instead of sleeping through 3 doomed retries. |
| **3** | **Dead provider hanging every worker for 60s+** | Shared **Circuit Breaker** opens for 60s after 5 consecutive Gemini failures, immediately routing new jobs/chunks straight to Groq (or failing clearly if Groq isn't configured). |
| **4** | **Runaway API bill from infinite loops or abuse** | Every generation call sets explicit **`max_output_tokens`** (e.g., `4096` for chunks, `8192` for single-pass) and checks `DAILY_TOKEN_BUDGET` / `MONTHLY_TOKEN_BUDGET` in Neon DB before calling AI. |
| **5** | **Zero visibility into per-call AI cost** | `TokenUsageLedgerModel` logs `{ jobId, callId, provider, model, inputTokens, outputTokens, cachedTokens, estimatedCostUsd }` for every AI request, viewable via `/api/analytics/tokens`. |
| **6** | **Groq Whisper crashing on > 25 MB or 1-hour files** | Groq fallback checks file size/duration and uses `audio_chunker` to split audio into < 20 MB `.m4a` clips before calling `client.audio.transcriptions.create`. |
| **7** | **English SaaS calls getting Hindi grocery hallucinations on Groq** | Hardcoded `"Boliye, khajoor..."` Whisper prompt is removed; Whisper prompt is dynamically derived from preset/domain (or neutral sales context). |
| **8** | **Wrong timestamps when Groq fallback runs** | `_call_groq` extracts real `segments` (`start`, `end`, `text`) from Whisper `verbose_json`, formats them with exact `[MM:SS]` timestamps, and instructs the LLM to diarize/group those exact timestamped segments rather than inventing `"00:00", "00:04"`. |
| **9** | **Prompt injection inside customer speech or custom rubric** | `AnalysisConfigInput` enforces `max_length` on `toneCriteria` & `customForbiddenPhrases`; transcripts are wrapped in `<UNTRUSTED_TRANSCRIPT>` delimiters across *all* paths (Gemini single-pass, Map-Reduce, Tier-1 re-eval, and Groq); and deterministic forbidden-phrase guard runs post-LLM. |
| **10** | **Silent failure when `GEMINI_API_KEY` expires or quota hits 0** | Health endpoint & AI Gateway surface structured, actionable status (`QUOTA_EXCEEDED`, `CIRCUIT_OPEN`, `AUTH_ERROR`) into `AnalysisJobModel.error_message` and UI alerts without exposing secret keys. |

---

## 4. Other Possible Options & Why We Chose This Design

### A. Resilience & Circuit Breaking
* **Option 1 — Simple `try/except` with immediate failover (Current):** *Rejected* because a single transient blip skips Gemini completely without a quick jittered retry, while a sustained outage still wastes time hitting Gemini on every single chunk.
* **Option 2 — External AI Gateway Proxy (LiteLLM / Portkey):** Powerful for multi-team orgs, *overkill* here—a lightweight 150-line Python `ai_gateway.py` gives full control over Gemini File API + Groq Whisper + Neon `TokenUsageLedger` with zero extra containers.

### B. Token Counting & Cost Control
* **Option 1 — Approximate character count only:** Inaccurate for audio and Hindi/Devanagari tokens.
* **Option 2 — Pre-flight estimation + Post-call `usage_metadata` ledger:** Gives exact billing accuracy from provider responses while preventing oversized calls pre-flight.

### C. Groq Fallback Handling
* **Option 1 — Drop Groq completely:** *Rejected* because dual-engine resilience is essential when Gemini experiences `503` spikes.
* **Option 2 — Repair Groq to preserve real Whisper timestamps & chunk large files:** Makes failover genuinely reliable instead of producing corrupted timestamps.

---

## 5. Required Inputs & Configuration Checklist

* **Already Configured in `backend/.env`:**
  * `GEMINI_API_KEY` ✅
  * `DATABASE_URL` (Neon PostgreSQL) ✅
* **Optional (Recommended to test failover end-to-end):**
  * `GROQ_API_KEY` (Free tier from `https://console.groq.com/`) — Enables live testing of Circuit Breaker failover + repaired Whisper timestamp preservation.
  * Optional env limits in `.env` (have safe defaults): `DAILY_TOKEN_BUDGET`, `MONTHLY_TOKEN_BUDGET`.
