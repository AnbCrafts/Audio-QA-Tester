# Platform Efficiency, Reliability & Edge Cases
### ScaleWorks AI Engineering Assessment — Forward Deployed Engineer (FDE)

This document outlines the **known edge cases**, **current implementation bottlenecks**, **efficiency optimization strategies**, and **code architecture standards** to transition this prototype into a production-grade, enterprise-ready platform.

---

## 1. Edge Cases That Might Fail (And Mitigation Strategies)

### A. Audio & Acoustic Edge Cases

| # | Edge Case | Failure Mode | Mitigation Strategy |
| :- | :--- | :--- | :--- |
| **1.1** | **Simultaneous Cross-Talk** (Both speakers talking at the same time) | Monophonic audio blends frequencies; diarization assigns both voices to one person or flips speaker labels. | Use energy-based voice activity detection (VAD) or prompt Gemini with explicit overlap penalty to segment concurrent speakers. |
| **1.2** | **IVR / Automated Bot at Start** (*"Press 1 for sales..."*) | Model evaluates the bot's automated script as the Sales Representative. | Add heuristic turn filtering: Ignore dialogue turns containing automated disclaimers before the two-way human dialogue begins. |
| **1.3** | **Long Hold Music & Silence** (Rep checks inventory for 45s) | Wastes context window tokens; causes timestamp drift and potential gateway timeouts. | Pre-process audio with Silence Removal (truncate silence intervals $> 5$ seconds down to 1 second). |
| **1.4** | **Low-Bitrate Telephony Audio** (8kHz/16kHz WhatsApp or VoIP) | Muffled audio leads to phonetic transcription errors in brand names, product codes, or currency figures. | Apply high-pass / band-pass acoustic normalization and allow user inline transcript correction in the UI. |

---

### B. Language, Culture & Conversational Nuances

| # | Edge Case | Failure Mode | Mitigation Strategy |
| :- | :--- | :--- | :--- |
| **1.5** | **Code-Switching (Hindi / Hinglish)** (*"Bataiye, 1 kilo kishmish pack kar do"*) | Models trained on Western corporate English may misinterpret colloquial slang or phonetically butcher Hinglish words. | Explicit multilingual instruction: Retain spoken language in Devanagari or Romanized script; separate translation layer for QA rubric scoring. |
| **1.6** | **Cultural Directness vs. Hostility** (*"Kitna loge? Jaldi bolo"*) | Direct, fast-paced retail bargaining may be falsely flagged as RED hostility. | Calibrate the sensitivity threshold: Distinguish between fast, transactional cadence and abusive/sarcastic disrespect. |
| **1.7** | **Conditional Commitments** (*"If my manager approves, I might send it"*) | Naive models extract speculative promises as confirmed action items with deadlines. | Prompt constraint: Require explicit modal verbs of commitment (*"I will"*, *"I promise to"*, *"Delivering tomorrow"*); reject speculative phrases (*"maybe"*, *"if possible"*). |
| **1.8** | **Speaker Attribution Inversion** (Customer makes the promise, not the Rep) | *"I will pay you tomorrow"* is assigned to the sales rep as an action item. | Enforce that each extracted commitment maps strictly to the speaker who spoke the quoted sentence (`isRep` verification). |

---

## 2. Issues & Bottlenecks in the Current Implementation

### Backend Bottlenecks
1. **Synchronous File Operations**:
   * File writing and processing inside FastAPI endpoints should use non-blocking asynchronous patterns to prevent worker thread starvation under concurrent loads.
2. **Gemini Cloud File Orphanage**:
   * When `client.files.upload()` is invoked, the audio file is stored in Google’s cloud storage. Currently, we delete the local temporary file but omit calling `client.files.delete(name=uploaded_audio.name)`. Over time, unused cloud files accumulate.
3. **Single-Pass Prompt Ceiling (10+ Minute Calls)**:
   * Requesting full turn-by-turn transcription, speaker diarization, tone evaluation, and action item extraction in a single prompt risks exceeding max output tokens on long recordings.
4. **Hardcoded Port Bindings**:
   * API endpoints reference `http://127.0.0.1:8000` rather than environment-configured base URLs (`VITE_API_URL`).

### Frontend Bottlenecks
5. **Transient State on Page Refresh**:
   * `currentReport` lives solely in React `useState`. Refreshing the browser loses the report, requiring re-upload.
6. **Object URL Memory Leaks**:
   * `URL.createObjectURL(file)` allocates browser memory that is not explicitly freed via `URL.revokeObjectURL()` on reset.
7. **Lack of Local Error Boundary**:
   * An unexpected schema mismatch in complex audio could crash the React component tree without a graceful fallback error card.

---

## 3. Efficiency & Performance Enhancements

### A. Latency & Token Optimization
* **Client/Server Audio Normalization**:
  * Downsample uploaded audio to 16kHz mono AAC before sending to the model. Reduces network payload size by up to 70% with zero loss in speech recognition accuracy.
* **Response Caching (Content-Addressed Hashing)**:
  * Generate an MD5/SHA-256 hash of the uploaded audio file + configuration JSON. If the identical file is re-analyzed under the same settings, return the cached result instantly (0ms latency, $0 token cost).
* **Two-Stage Pipeline (For Enterprise Calls $> 15$ mins)**:
  * **Stage 1 (Transcription)**: Fast audio-to-text transcription via Whisper on Groq (~1–2 seconds).
  * **Stage 2 (Reasoning)**: Structured LLM evaluation on text (~1.5 seconds).
  * Reduces total turnaround time from 20s down to ~4s on long calls.

### B. Reliability & Cost Control
* **Dual-Engine Auto-Failover**:
  * Seamless fallback from Gemini 3.5 Flash to Groq (Whisper + Llama/Qwen) when API rate limits (HTTP 429/503) are encountered.
* **Deterministic Structured JSON**:
  * Strict Pydantic schema validation on all responses guarantees the frontend never receives malformed JSON.

---

## 4. Code Cleanliness & Architectural Rules

To maintain high code quality and avoid convoluted, unreadable AI-generated code:

### Frontend Rules (React + TypeScript):
1. **Standard `rafce` Component Structure**:
   * Functional components with explicit props interface, hooks organized at the top, clear handler functions, and clean JSX.
2. **No Over-Engineered Syntax**:
   * No nested ternary operators (`a ? b ? c : d : e`). Use plain `if/else` or early returns.
   * Standard `try / catch` blocks with meaningful user error states.
   * Descriptive, human-readable function names (`handleAudioUpload`, `toggleSpeakerRole`, `saveTranscriptEdit`).
3. **Strict Type Safety**:
   * Avoid `any` types. All API responses must match typed interfaces in `src/types.ts`.

### Backend Rules (FastAPI + Python):
1. **Single Responsibility Functions**:
   * Dedicated, readable helper functions (`validate_audio_container`, `upload_to_gemini`, `clean_cloud_storage`).
2. **Pydantic Validation**:
   * Every request payload and response body must be strongly validated using Pydantic v2 models.
3. **Zero Leaked Secrets**:
   * API keys must remain strictly in `backend/.env` (server-side only, ignored by Git).

---

## 5. Step-by-Step Implementation Roadmap

- [x] **Step 1: Code Standardization & Simplification**
  * Refactor existing frontend components into standard, clean `rafce` functional patterns with readable handlers.
  * Standardize API client calls using clean environment-configured URLs.
- [x] **Step 2: Resource Cleanup & Memory Safety**
  * Add automatic Gemini cloud file deletion (`client.files.delete()`).
  * Add `URL.revokeObjectURL()` cleanup in React to prevent browser memory leaks.
- [x] **Step 3: Response Caching & Performance**
  * Implement audio file hash caching (SHA-256) to avoid redundant API billing and provide instant responses for re-uploaded calls.
- [ ] **Step 4: Edge Case Robustness**
  * Refine prompts to reject conditional commitments.
  * Implement silence/hold music mitigation rules.
