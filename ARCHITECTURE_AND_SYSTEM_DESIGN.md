# ScaleWorks AI — Sales Call Quality Analysis Agent
## Comprehensive Architecture, System Design & Technical Specification

This document provides an exhaustive, production-grade technical breakdown of the **Sales Call Quality Analysis Agent** developed for the ScaleWorks AI Forward Deployed Engineer (FDE) Assessment. It details every architectural layer, data lifecycle, class, method, scoring formula, edge-case mitigation, and design trade-off implemented across the platform.

---

# Table of Contents
1. [Executive Summary & Core Philosophy](#1-executive-summary--core-philosophy)
2. [End-to-End System Architecture](#2-end-to-end-system-architecture)
3. [Audio Lifecycle & File Management](#3-audio-lifecycle--file-management)
4. [Content-Addressed Deterministic Caching](#4-content-addressed-deterministic-caching)
5. [Dual-Engine Multimodal AI Pipeline](#5-dual-engine-multimodal-ai-pipeline)
6. [Detailed Code Walkthrough: Classes, Methods & Files](#6-detailed-code-walkthrough-classes-methods--files)
7. [Scoring Engine, Mathematical Formulas & Thresholds](#7-scoring-engine-mathematical-formulas--thresholds)
8. [Edge Cases & Technical Mitigations](#8-edge-cases--technical-mitigations)
9. [Technology Stack & Architectural Trade-offs](#9-technology-stack--architectural-trade-offs)

---

# 1. Executive Summary & Core Philosophy

The **Sales Call Quality Analysis Agent** is a full-stack automated quality assurance, compliance evaluation, and commitment-tracking system designed to audit unstructured business call recordings (`.m4a`).

### Core Design Principles:
1. **Isolated Representative Tone Evaluation**:
   The sales representative is audited strictly on their own demeanor. Agitated, hostile, or demanding customers are isolated under an independent *Customer Friction* metric so an angry customer never penalizes an empathetic, composed representative.
2. **Evidence-Grounded Accountability (Zero Hallucinations)**:
   Every RED or GREEN tone verdict and every extracted action item MUST cite verbatim dialogue quotes with exact timestamps (`"MM:SS"`).
3. **No Speculative or Fabricated Deadlines**:
   If an action item lacks a verbalized calendar date or clock time, the deadline field is strictly coerced to `null` (`No Deadline`), rejecting LLM tendencies to invent arbitrary timelines.
4. **Dynamic Multilingual Speech Processing (Hindi / Hinglish / English)**:
   Rather than butchering Indian conversational speech into broken English phonetics, the system preserves verbatim Hindi and Hinglish utterances while evaluating compliance against universal and domain rubrics.
5. **Zero-Latency Content-Addressed Caching**:
   Repeated runs of the identical recording under identical settings return instantaneously in **0ms** with **$0 token cost**.
6. **Configurable Without Code Changes**:
   Domain presets, custom rubrics, strictness sliders, and forbidden phrases are injected into the reasoning prompt at runtime.

---

# 2. End-to-End System Architecture

```
                                  USER BROWSER (React + Vite)
      ┌─────────────────────────────────────────────────────────────────────────────────┐
      │  Upload Dropzone │ Audio Player Bar │ Tone Card │ Commitments │ Transcript View│
      └────────────────────────────────────────┬────────────────────────────────────────┘
                                               │ HTTP POST /api/analyze (multipart/form-data)
                                               ▼
                              FASTAPI BACKEND GATEWAY (port 8000)
      ┌─────────────────────────────────────────────────────────────────────────────────┐
      │  1. Container Validation (.m4a, .mp3, .wav, .aac, .ogg)                         │
      │  2. Asynchronous Payload Reading & In-Memory SHA-256 Hashing                    │
      │  3. Cache Verification (backend/cache/{audio_hash}_{config_hash}.json)          │
      └───────────────────────────────┬─────────────────────────────────┬───────────────┘
                     [Cache Hit: 0ms] │                                 │ [Cache Miss]
                                      ▼                                 ▼
                          Return Stored JSON Report          Temporary Disk Persistence
                                                            (tempfile.NamedTemporaryFile)
                                                                        │
                                                    ┌───────────────────┴───────────────────┐
                                                    │ asyncio.to_thread(analyze_call_with_ai)│
                                                    └───────────────────┬───────────────────┘
                                                                        │
                                            ┌───────────────────────────┴───────────────────────────┐
                                            ▼                                                       ▼
                             PRIMARY ENGINE: Gemini 3.5 Flash                         FALLBACK ENGINE: Groq Inference
                    ┌─────────────────────────────────────────────────┐     ┌─────────────────────────────────────────────────┐
                    │ • Cloud File Upload (client.files.upload)       │     │ • Audio Transcription (Whisper Large v3 Turbo)  │
                    │ • Native Multimodal Waveform Diarization        │     │   - Context Prompt (Hindi/Hinglish guidance)    │
                    │ • 503 Load Spike Exponential Backoff            │     │ • Turn Segmentation & Reasoning (Qwen 27B)      │
                    │ • Model Priority: 3.5-flash -> 3.1-flash-lite   │     │ • Multi-turn Diarization & Scoring              │
                    │ • Guaranteed Cleanup (client.files.delete)      │     └────────────────────────┬────────────────────────┘
                    └───────────────────────┬─────────────────────────┘                              │
                                            │                                                        │
                                            └───────────────────────────┬────────────────────────────┘
                                                                        ▼
                                                         DEFENSIVE SCHEMA SANITIZATION
                                                    ┌───────────────────────────────────────┐
                                                    │ • Clamp Sub-scores (0-100)            │
                                                    │ • Dynamic Fallback Score Derivation   │
                                                    │ • Null Deadline Coercion              │
                                                    │ • Derive isRep Speaker Booleans       │
                                                    │ • Auto-Domain Context Classification  │
                                                    │ • Universal Etiquette Checklist Audit │
                                                    └───────────────────┬───────────────────┘
                                                                        │
                                            ┌───────────────────────────┴───────────────────────────┐
                                            ▼                                                       ▼
                             Save to Cache (if turns > 0)                               Return Validated
                             backend/cache/{key}.json                                   AnalysisReport JSON
```

---

# 3. Audio Lifecycle & File Management

### 3.1 File Ingestion & Temporary Storage
When an audio recording is uploaded via the frontend, the payload arrives at `POST /api/analyze` as a FastAPI `UploadFile`.

1. **Format Validation**:
   - Allowed containers: `.m4a`, `.mp3`, `.wav`, `.ogg`, `.aac`.
   - File size ceiling: `25 MB` enforced on both frontend and backend.
2. **In-Memory Reading**:
   ```python
   content = await file.read()
   file_size_mb = f"{len(content) / (1024 * 1024):.2f} MB"
   ```
   Reading the raw bytes into memory allows computing the SHA-256 fingerprint immediately without disk I/O.
3. **Safe Local File Persistence**:
   - Because Windows enforces strict OS file-locking on open file handles, temporary files are managed via Python's `tempfile.NamedTemporaryFile`:
     ```python
     suffix = os.path.splitext(filename)[1]
     with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
         tmp_path = tmp_file.name
         tmp_file.write(content)
     ```
   - Local temporary files are strictly wiped inside a `finally:` block:
     ```python
     finally:
         if os.path.exists(tmp_path):
             try:
                 os.remove(tmp_path)
             except OSError:
                 pass
     ```

### 3.2 Google Cloud Temporary File Lifecycle
When interacting with Google's Gemini File API:
1. `uploaded_audio = client.files.upload(file=file_path)` uploads the audio to Google Cloud.
2. The backend polls the file's state (`ACTIVE`) with a 15-second timeout window.
3. **Guaranteed Cloud File Deletion**:
   To prevent customer audio files from lingering in cloud buckets or consuming account storage quotas, deletion is enforced inside `_call_gemini`'s `finally:` block:
   ```python
   finally:
       try:
           client.files.delete(name=uploaded_audio.name)
           print(f"[Cleanup] Deleted temporary Gemini cloud file: {uploaded_audio.name}")
       except Exception as cleanup_err:
           print(f"[Warning] Gemini cloud file cleanup failed: {cleanup_err}")
   ```

### 3.3 Browser Object URL Garbage Collection
In the React frontend (`frontend/src/App.tsx`), uploaded audio is loaded into the HTML5 audio player via `URL.createObjectURL(file)`:
- Browsers do not automatically garbage collect Object URLs until page reload, leading to memory leaks over prolonged analysis sessions.
- Memory cleanup is implemented at three distinct moments:
  1. **Before new allocation**: Revokes `currentReport.audioUrl` before allocating the new blob.
  2. **On Dashboard Reset**: Calls `URL.revokeObjectURL(currentReport.audioUrl)` in `handleReset`.
  3. **On Component Unmount**: Wrapped inside `useEffect` cleanup:
     ```typescript
     useEffect(() => {
       return () => {
         if (currentReport?.audioUrl) {
           URL.revokeObjectURL(currentReport.audioUrl);
         }
       };
     }, [currentReport?.audioUrl]);
     ```

---

# 4. Content-Addressed Deterministic Caching

The caching engine (`backend/cache_service.py`) eliminates redundant API billing and accelerates re-analysis to **0ms**.

### 4.1 Composite SHA-256 Key Formulation
The cache key is a composite cryptographic fingerprint composed of:
1. **Audio Binary Hash** (`audio_hash`): SHA-256 of the raw audio bytes (truncated to 24 characters).
2. **Canonical Config Hash** (`config_hash`): SHA-256 of the configuration parameters serialized into sorted, whitespace-normalized JSON (truncated to 16 characters).

$$\text{Cache Key} = \text{SHA256}(\text{Audio Bytes})[:24] + \text{"\_"} + \text{SHA256}(\text{Sorted JSON Config})[:16]$$

```python
def compute_cache_key(audio_bytes: bytes, config_dict: Dict[str, Any]) -> str:
    audio_hasher = hashlib.sha256()
    audio_hasher.update(audio_bytes)
    audio_hash = audio_hasher.hexdigest()[:24]

    config_str = json.dumps(config_dict, sort_keys=True)
    config_hasher = hashlib.sha256()
    config_hasher.update(config_str.encode("utf-8"))
    config_hash = config_hasher.hexdigest()[:16]

    return f"{audio_hash}_{config_hash}"
```

### 4.2 Cache Sensitivity Matrix
| Input Changed | Resulting Behavior |
| :--- | :--- |
| **Different Audio Uploaded** | `audio_hash` changes $\rightarrow$ **Cache Miss** $\rightarrow$ fresh analysis. |
| **Same Audio, Sensitivity shifted (`balanced` $\rightarrow$ `strict`)** | `config_hash` changes $\rightarrow$ **Cache Miss** $\rightarrow$ re-evaluates tone against 80/100 threshold. |
| **Same Audio, Rubric Edited in Drawer** | `config_hash` changes $\rightarrow$ **Cache Miss** $\rightarrow$ audits tone against new rubric. |
| **Same Audio, Added Forbidden Phrase** | `config_hash` changes $\rightarrow$ **Cache Miss** $\rightarrow$ checks for forbidden term. |
| **Identical Audio + Identical Settings** | Both hashes match $\rightarrow$ **Cache Hit** $\rightarrow$ instant **0ms** return with `cached: true`. |

### 4.3 Cache Poisoning Safeguards
To ensure that an aborted run, 0-turn transcript, or API glitch is never permanently stored on disk:
```python
# In backend/main.py: Only store in cache if it produced a real transcript
if report.transcript and len(report.transcript) > 0:
    save_cached_report(cache_key, report.model_dump())
```
Additionally:
- `DELETE /api/cache` clears all cached reports from `backend/cache/`.
- The frontend provides a **`Clear Cache`** button directly in the toolbar.

---

# 5. Dual-Engine Multimodal AI Pipeline

To achieve enterprise reliability, the platform utilizes an automated **Dual-Engine Auto-Failover Architecture** (`backend/audio_service.py`).

```
                    ┌──────────────────────────────────────────────┐
                    │           Dual-Engine Architecture           │
                    └──────────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
       [Primary Engine: Multimodal]                  [Fallback Engine: Cascaded]
             Gemini 3.5 Flash                             Groq Inference
    • Direct Waveform Understanding              • Whisper Large v3 Turbo (ASR)
    • Native Speaker Diarization                 • Hindi/Hinglish Context Prompting
    • Multilingual Code-Switching                • Qwen 27B / GPT-OSS Reasoning
    • Turn-by-Turn Timestamping                  • Turn Segmentation Post-Processing
```

### 5.1 Primary Engine: Google Gemini 3.5 Flash
* **Architecture**: Direct native multimodal audio inference.
* **Why Multimodal?**
  Cascaded architectures (ASR $\rightarrow$ Text $\rightarrow$ LLM) lose acoustic cues such as volume, cadence, sarcasm, and vocal agitation. Gemini ingests raw audio waveforms directly, evaluating vocal inflection and speaker acoustic separation simultaneously.
* **Resilience Strategy**:
  1. Priority order: `gemini-3.5-flash` $\rightarrow$ `gemini-3.1-flash-lite`.
  2. **503 Load Spike Exponential Backoff**:
     If Google returns `503 UNAVAILABLE` (*"model is currently experiencing high demand"*), the engine catches the exception, pauses 2 seconds, and retries up to 2 times before falling back.

### 5.2 Fallback Engine: Groq High-Speed Inference
* **Architecture**: Two-stage cascaded pipeline.
  1. **Stage 1 (Transcription)**: `whisper-large-v3-turbo` on Groq LPU hardware (~1.2s execution).
     - *Acoustic Context Prompt*:
       ```python
       prompt = "Sales call order in Hindi, Hinglish, and English. Boliye, khajoor, bada dana, chota dana, packet, haan, theek hai, bhaiya, kitna hua."
       ```
       Providing phonetic anchor tokens prevents Whisper from transcribing Hindi dialogue into broken English approximations (e.g. converting *"green packet"* to *"green baggat"* or *"aloevera"* to *"Aloe sogaramola"*).
  2. **Stage 2 (Reasoning & Diarization)**: `qwen/qwen3.8-27b` / `openai/gpt-oss-120b`.
     - Deconstructs Whisper's continuous paragraph into alternating turns between `"Sales Rep"` and `"Customer"`.
     - Assigns sequential timestamps and evaluates tone sub-scores.

### 5.3 Flexible Key Normalization
Different LLMs frequently structure output JSON with minor key variations. To prevent parsing crashes, `_build_report_from_json` dynamically normalizes keys:
- **Transcripts**: `data.get("transcript")` $\lor$ `data.get("transcriptSegments")` $\lor$ `data.get("segments")` $\lor$ `data.get("dialogue")`.
- **Action Items**: `data.get("actionItems")` $\lor$ `data.get("action_items")` $\lor$ `data.get("commitments")`.
- **Quotes**: `tone_raw.get("evidenceQuotes")` $\lor$ `tone_raw.get("evidence_quotes")` $\lor$ `tone_raw.get("quotes")`.

---

# 6. Detailed Code Walkthrough: Classes, Methods & Files

### 6.1 Backend Files

#### `backend/main.py`
The API entry point built on FastAPI.
- `health_check()` (`GET /api/health`): Returns system health and checks for configured Gemini/Groq keys.
- `clear_cache()` (`DELETE /api/cache`): Wipes all JSON files in `backend/cache/`.
- `analyze_call()` (`POST /api/analyze`):
  - Validates container extension.
  - Reads binary bytes into memory and computes `cache_key`.
  - Checks disk cache for an existing report with `len(transcript) > 0`.
  - Saves file temporarily to disk.
  - Executes `await asyncio.to_thread(analyze_call_with_ai, ...)`:
    - **CRITICAL**: Offloads blocking synchronous AI calls to a separate worker threadpool, keeping the FastAPI asyncio event loop non-blocking and responsive to incoming health checks and preflight CORS requests.
  - Stores valid results to disk cache and cleans up local temporary files in `finally:`.

#### `backend/schemas.py`
Pydantic v2 data models enforcing strict schema validation.
- `AnalysisConfigInput`: Validates incoming user settings (`presetId`, `presetName`, `sensitivity`, `toneCriteria`, `actionItemScope`, `customForbiddenPhrases`, `repSpeakerId`, `aiProvider`).
- `EvidenceQuote`: Grounded quotes with `quote`, `speaker`, `explanation`, and `timestamp`.
- `SentimentBreakdown`: Clamped integer sub-scores (`repProfessionalism`, `repEmpathy`, `repPatience`, `customerFrustration`) constrained between 0 and 100 via `Field(ge=0, le=100)`.
- `ToneAnalysisResult`: Contains `rating` (`GREEN` or `RED`), `headline`, `explanation`, `evidenceQuotes`, `confidenceScore`, and `sentimentBreakdown`.
- `ActionItem`: Grounded task model with `id`, `task`, `owner` (`Sales Rep`, `Customer`, `Unspecified`), `deadline`, `evidenceQuote`, `timestamp`, `seconds`, `confidence`.
- `TranscriptSegment`: Individual dialogue turn model with `id`, `speaker`, `isRep`, `timestamp`, `seconds`, `text`, `isFlaggedEvidence`.
- `CallMetadata`: Context classification model containing `detectedCategory`, `categoryConfidence`, `domainSummary`, `greetingObserved`, `politeLanguageObserved`, `professionalClosingObserved`, `etiquetteNotes`.
- `AnalysisReport`: Master payload returned to frontend.

#### `backend/prompts.py`
Dynamic system prompt generator.
- `build_system_prompt(config: AnalysisConfigInput) -> str`:
  - Translates sensitivity string (`low`, `balanced`, `strict`) into numeric cutoffs ($50, 65, 80$).
  - Injects user-configured criteria and custom forbidden phrases.
  - Enforces target isolation (audit rep only, contrast customer friction).
  - Enforces strict rejection of conditional commitments.
  - Enforces IVR bot disclaimer filtering and silence tolerance.
  - Enforces auto-domain context classification and universal etiquette auditing.

#### `backend/cache_service.py`
Deterministic content-addressed storage helper.
- `compute_cache_key(audio_bytes, config_dict) -> str`: Produces SHA-256 composite hash.
- `get_cached_report(cache_key) -> Optional[dict]`: Safely reads cached JSON from `backend/cache/`.
- `save_cached_report(cache_key, report_dict) -> None`: Persists report to disk.

#### `backend/audio_service.py`
Orchestrator for the dual-engine pipeline.
- `analyze_call_with_ai(...) -> AnalysisReport`: Routes requests to Gemini with automatic fallback to Groq.
- `_call_gemini(...)`: Multimodal Google GenAI pipeline with active file polling, model fallback, 503 retry, and cloud cleanup.
- `_call_groq(...)`: Whisper Large v3 Turbo transcription + Qwen reasoning pipeline.
- `_build_report_from_json(...)`: Defensive sanitizer that clamps scores (0-100), calculates dynamic fallback scores, coerces `"null"` strings to Python `None`, and constructs `AnalysisReport`.

---

### 6.2 Frontend Files (React + TypeScript)

#### `frontend/src/App.tsx`
Central dashboard container following standard `rafce` structure.
- State: `config`, `currentReport`, `isProcessing`, `processingStep`, `isConfigOpen`, `errorMessage`, `seekTime`, `isBackendConnected`.
- Width styling: `w-[90%] mx-auto` giving a 90% wide responsive view across all displays.
- Handlers:
  - `handleFileUpload(file)`: Sends multipart form data with a 5-minute `AbortController` timeout window and multi-stage user progress messages.
  - `handleReset()`: Clears report and revokes audio blob URLs.
  - `handleJumpToTimestamp(timestamp, seconds)`: Controls seeking in `AudioPlayerBar`.
  - `handleUpdateTranscriptSegment(id, newText, newSpeaker)`: Allows inline editing of dialogue turns.

#### `frontend/src/components/Navbar.tsx`
Top header spanning 90% page width.
- Live backend connection pulse indicator (`AI Engine Ready` / `Connecting...`).
- Active Preset pill displaying the current business domain.
- Primary `Configure Agent` trigger button.

#### `frontend/src/components/UploadDropzone.tsx`
File ingestion panel with 1-click test pills and multilingual call selector.
- Drag-and-drop zone with validation (max 25MB, supported audio containers).
- Animated multi-stage progress spinner with live status steps.
- **1-Click Test Actions**:
  - `GREEN Compliant Call` (Single green status dot, loads `test_call_green.m4a`).
  - `RED Hostile Violation Call` (Single red status dot, loads `test_call_red.m4a`).
  - **Language / Call Selection Dropdown**: Clean styled select menu to load Hindi WhatsApp calls (`test_call_multilingual.m4a`, `test1.m4a`, `test2.m4a`, `test7.m4a`).

#### `frontend/src/components/ToneCard.tsx`
Tone quality assessment card.
- High-contrast verdict pill: `TONE VERDICT: GREEN (COMPLIANT)` vs `TONE VERDICT: RED (VIOLATION)`.
- **Auto-Detected Domain Pill**: Displays detected category (e.g. `🎯 Auto-Detected Domain: Technical Support & Bug Triage`) with confidence %.
- **Overall Quality Score Meter**: Real-time progress bar displaying calculated composite quality score ($Q$) out of 100.
- **Sub-score Matrix**: 4 isolated cards for Professionalism, Empathy, Patience, and Customer Friction.
- **Universal Politeness & Etiquette Checklist**:
  - $\checkmark$ Greeting & Politeness Opening
  - $\checkmark$ Active Courtesy & Affirmations
  - $\checkmark$ Professional Closing / Sign-off
- **Evidence Quote Cards**: Verbatim quotes with `⏱ MM:SS` jump buttons.

#### `frontend/src/components/ActionItemsList.tsx`
Extracted commitments list.
- Badges for owner (`Sales Rep`, `Customer`, `Unspecified`).
- Badges for deadline (`⏱ Spoken Deadline` vs `No Deadline`).
- Clickable quote snippet that seeks the audio player to the exact second.

#### `frontend/src/components/TranscriptViewer.tsx`
Complete unabridged dialogue turn viewer.
- Turn counter (`#X of Y Turns`).
- Filter tabs (`All`, `Rep`, `Customer`).
- Real-time dialogue text search bar.
- Jump controls (`Scroll to Top (00:00)` and `Scroll to Bottom`).
- Height expand/collapse toggle (`Maximize2` / `Minimize2`).
- `Copy Transcript` and `Export .txt` buttons.
- Inline turn editor (pencil icon) to fix misheard words or toggle speaker role.

#### `frontend/src/components/AudioPlayerBar.tsx`
Synchronized HTML5 audio player.
- Dynamic timeline duration derived from `audio.onLoadedMetadata`.
- Scrubbable range slider with millisecond seeking.
- Playback speed toggles (`1x`, `1.25x`, `1.5x`, `2x`).
- Volume slider and mute toggle.

#### `frontend/src/components/ConfigDrawer.tsx`
Slide-over configuration drawer.
- 4 Business Presets with 1-click switching.
- Freeform Tone Evaluation Rubric textarea with *Reset to Default*.
- Flag Sensitivity selector (`Low`, `Balanced`, `Strict`).
- Action Item Extraction Scope selector (`explicit_commitments`, `strict_deadlines_only`, `all_followups`).
- Custom Monitored Phrases tag adder/remover.
- AI Engine selector (`Gemini 3.5 Flash` vs `Groq Llama-3.3/Qwen`).

---

# 7. Scoring Engine, Mathematical Formulas & Thresholds

### 7.1 Composite Quality Score ($Q$)
Rather than relying on a single subjective verdict, the representative's performance is computed as a weighted sum:

$$Q = 0.40 \times \text{Professionalism} + 0.35 \times \text{Patience} + 0.25 \times \text{Empathy}$$

*Scores range from 0 to 100.*

### 7.2 Decision Cutoff Threshold ($T$)
The active Sensitivity setting dictates the minimum passing mark:

$$\text{Verdict} = \begin{cases} \mathbf{GREEN} \text{ (Compliant)}, & \text{if } Q \ge T \\ \mathbf{RED} \text{ (Violation)}, & \text{if } Q < T \end{cases}$$

| Sensitivity Level | Threshold ($T$) | Character | Audit Strictness |
| :--- | :---: | :--- | :--- |
| **`low`** | **$50 / 100$** | Lenient | Flags only severe profanity, screaming, slurs, or extreme hostility. |
| **`balanced`** *(Default)* | **$65 / 100$** | Standard B2B | Flags sarcasm, dismissiveness, condescension, or talking over the client. |
| **`strict`** | **$80 / 100$** | Zero-Tolerance | Flags minor impatience, apathy, robotic disinterest, or hesitation. |

### 7.3 Boundary Condition: Why 60 is GREEN and 59 is RED (At Cutoff $T=60$)
If the passing cutoff is set to $60/100$:
- **$Q = 60$**: Meets the compliance threshold ($60 \ge 60$) $\rightarrow$ **`GREEN`**.
- **$Q = 59$**: Fails the compliance threshold by 1 point ($59 < 60$) $\rightarrow$ **`RED`**. The engine extracts and cites the specific quote that caused the score deduction.

### 7.4 Automatic Immediate RED Overrides (Zero-Tolerance Rules)
Regardless of the composite score $Q$, the verdict is vetoed to **`RED`** if any of the following occur:
1. **Personal Insults & Sarcasm**: e.g., *"If your team can't read docs, no software will help you."*
2. **Aggressive Hang-Ups**: Terminating a call abruptly without a sign-off.
3. **Forbidden Phrase Match**: Rep speaks any phrase in the active *Custom Monitored Phrases* list.
4. **Regulatory Harassment**: Making threats or violating legal disclosure rules (Debt Collection).

### 7.5 Customer Friction Isolation ($0\%$ Weight on Rep Score)
Customer frustration is scored from 0 to 100 but given **$0\%$ weight** in $Q$.
- *Example*: A customer screaming about a pricing hike is rated `Customer Friction: 95/100`.
- If the representative calmly responds: *"I completely understand your frustration with the Q3 price adjustments, let me review what discounts we can apply"*, the rep receives:
  - `Professionalism: 95/100`
  - `Patience: 95/100`
  - `Empathy: 92/100`
  - Overall $Q = 94.25/100 \implies \mathbf{GREEN}$.
- Customer hostility is visible in the UI to validate contrast without penalizing the rep.

---

# 8. Edge Cases & Technical Mitigations

| # | Edge Case | Failure Mode (Without Mitigation) | Implemented Mitigation |
| :- | :--- | :--- | :--- |
| **1** | **Speculative Commitments** | *"If my manager approves, I might send it"* extracted as a firm action item with a deadline. | Injected prompt constraint: strictly rejects modal hedges (*"maybe"*, *"might"*, *"if possible"*). Extracts only confirmed promises. |
| **2** | **Fabricated Deadlines** | Model invents dates like *"next Monday"* when no timeframe was spoken. | Enforced rule: if a calendar date was not spoken, `deadline` is coerced to `null` (`No Deadline`). |
| **3** | **Speaker Inversion** | Customer says *"I will pay tomorrow"*; naive models assign the task to Sales Rep. | Enforced speaker mapping: action item owner must strictly match the speaker of the cited quote (`isRep` verification). |
| **4** | **Automated IVR / Bot Preamble** | *"This call may be recorded..."* or bot menu evaluated as representative tone. | Preamble turns labeled as `"IVR"` or `"Customer"`; model instructed that Rep evaluation starts only when human dialogue begins. |
| **5** | **Silence & Hold Music** | Rep checks warehouse for 45 seconds; hold music causes timestamp drift or fake turns. | Acoustic rule: disregard hold music; never hallucinate turns during silence; resume timestamps accurately. |
| **6** | **Multilingual Code-Switching** | Hindi/Hinglish audio transcribed into broken English phonetic gibberish. | Gemini multimodal audio processes Hindi natively; Groq Whisper provided with Hindi context prompt anchor tokens. |
| **7** | **FastAPI Event Loop Starvation** | Synchronous AI calls in `async def` route freeze port 8000; health checks hang. | Wrapped AI call in `await asyncio.to_thread(...)`, delegating blocking I/O to a worker threadpool. |
| **8** | **Object URL Memory Leaks** | Continuous uploads allocate browser blob memory until tab crashes. | Implemented `URL.revokeObjectURL()` before allocation, on reset, and in `useEffect` unmount cleanup. |
| **9** | **Gemini 503 Spikes** | Temporary Google API load spikes drop requests to fallback engine prematurely. | Implemented 2-second pause with exponential backoff retry loop before switching engines. |
| **10**| **Cache Poisoning** | Degraded 0-turn transcripts saved to disk cache, permanently serving empty results. | Validation rule: only save reports with `len(transcript) > 0`; added `DELETE /api/cache` endpoint. |
| **11**| **Scrollbar Clutter** | Double scrollbars in transcript viewers and body look unpolished. | Universal cross-browser hiding rule via `index.css` (`scrollbar-width: none !important`) with smooth scrolling intact. |
| **12**| **Client Timeout Truncation** | 2-minute client timeout aborts 40-turn Hindi calls with *"signal is aborted without reason"*. | Extended client timeout to 5 minutes (300,000ms); added user-friendly error guidance on abort. |

---

# 9. Technology Stack & Architectural Trade-offs

### 9.1 Frontend: React + Vite + Tailwind CSS vs Alternatives
* **Decision**: Single Page Application (SPA) built with React 19, Vite, and Tailwind CSS.
* **Alternatives Considered**: Next.js, Remix, Vue, plain Vanilla JS.
* **Why Chosen**:
  - Vite provides sub-second hot module replacement (HMR) and fast build times (2.2s).
  - An SPA architecture avoids unnecessary server-side rendering (SSR) overhead for an application that operates entirely on client-staged media streams and API responses.
  - Tailwind CSS provides utility-first styling with zero CSS runtime overhead.

### 9.2 Backend: FastAPI vs Alternatives
* **Decision**: FastAPI on Python 3.11 with Uvicorn.
* **Alternatives Considered**: Node.js (Express), Django, Flask, Go (Gin).
* **Why Chosen**:
  - Native asynchronous concurrency model (`async/await`) combined with worker threadpools (`asyncio.to_thread`).
  - Seamless integration with leading AI SDKs (`google-genai`, `groq`, `edge-tts`).
  - Native OpenAPI/Swagger documentation generation.
  - Automatic request/response validation through Pydantic v2.

### 9.3 AI Engine: Multimodal Native Audio vs Cascaded Whisper + LLM
* **Decision**: Primary **Gemini 3.5 Flash** (Multimodal) with fallback to **Groq Whisper + Qwen**.
* **Alternatives Considered**: Deepgram Nova-2, OpenAI Whisper API, AssemblyAI.
* **Why Chosen**:
  - Traditional cascaded pipelines (Audio $\rightarrow$ Whisper ASR $\rightarrow$ LLM text reasoning) lose prosodic acoustic information (inflection, shouting, sarcasm, emotional cadence).
  - Gemini processes raw audio waveforms natively, performing speaker diarization, multilingual phonetic decoding, and tone quality evaluation in a single unified pass.
  - Groq fallback provides ultra-fast inference (~1.5s total turnaround) whenever Google Cloud limits are encountered.

### 9.4 Cache: Filesystem JSON vs Redis / Database
* **Decision**: Filesystem content-addressed storage in `backend/cache/{hash}.json`.
* **Alternatives Considered**: Redis, Memcached, PostgreSQL/SQLite.
* **Why Chosen**:
  - Requires **zero external infrastructure dependencies** (no Docker containers or database servers required to clone and run the project).
  - Extremely fast read/write speeds for small JSON payloads (< 20KB).
  - Easily inspectable and clearable by developers during local testing.
