# ScaleWorks AI — Master Edge Cases & Security Vulnerabilities Specification
## Comprehensive Audit of All Operational Edge Cases, Mitigations, and Security Defenses

This document is the definitive master catalog of all edge cases, conversational ambiguities, infrastructure bugs, token optimization challenges, and cybersecurity vulnerabilities addressed during the design, development, and hardening of the **Sales Call Quality Analysis Agent**.

---

# Table of Contents
1. [Audio, Acoustic & Speech Edge Cases](#1-audio-acoustic--speech-edge-cases)
2. [Conversational, Dialogue & Semantic Edge Cases](#2-conversational-dialogue--semantic-edge-cases)
3. [Hallucination Prevention & Commitment Integrity](#3-hallucination-prevention--commitment-integrity)
4. [Backend, Concurrency & Infrastructure Edge Cases](#4-backend-concurrency--infrastructure-edge-cases)
5. [Token Economics, Cost & Latency Edge Cases](#5-token-economics-cost--latency-edge-cases)
6. [Cybersecurity Vulnerabilities & Mitigations](#6-cybersecurity-vulnerabilities--mitigations)
7. [Pre-Execution Token Loss: The Pydantic Defense Paradox](#7-pre-execution-token-loss-the-pydantic-defense-paradox)
8. [Backend Execution Commands & Operational Guide](#8-backend-execution-commands--operational-guide)

---

# 1. Audio, Acoustic & Speech Edge Cases

### 1.1 Multilingual Code-Switching (Hindi / Hinglish / English)
- **The Problem**: In Indian business calls, speakers constantly mix Hindi and English within the same sentence (*"Bhaiya, kishmish aur safawi dates pack kar do, invoice mail pe bhej dena"*). Standard ASR models trained on Western English phonetically butcher Hindi words into bizarre English words (e.g. transcribing *"bhejo"* as *"beige-oh"*).
- **The Mitigation**:
  1. *Primary*: **Gemini 3.5 Flash** processes the raw audio waveform directly; its pre-training natively understands Indic accents and code-switched Hindi-English speech.
  2. *Fallback*: In **Groq Whisper Large v3 Turbo**, we inject domain anchor tokens into the context prompt (`prompt="Sales call order in Hindi, Hinglish, and English. Boliye, theek hai, bhejo, shukriya..."`) to anchor Whisper's language decoder to Hinglish vocabulary.

### 1.2 Automated IVR & Call Center Disclaimers
- **The Problem**: Calls often start with automated robot preambles (*"This call may be recorded for quality and training purposes..."*). Naive models evaluate this automated script as the Sales Representative's tone.
- **The Mitigation**: Injected prompt rules explicitly instruct the model to label preambles with speaker `"IVR"` or `"System"` and start evaluating the Sales Representative *only* when the human agent speaks.

### 1.3 Extended Silence, Ringing & Hold Music
- **The Problem**: Reps frequently place customers on hold for 30–60 seconds to check inventory. Models like Whisper often hallucinate fake repetitive text during music (e.g., *"Thank you for watching, please subscribe"*), causing timestamp drift and corrupted transcripts.
- **The Mitigation**: Acoustic instructions instruct the multimodal model to treat hold music and silence as non-speech intervals, keeping timestamps sequential without inventing dialogue turns.

### 1.4 Simultaneous Speech / Cross-Talk Overlap
- **The Problem**: During heated negotiations, both parties speak at the same time. Monophonic audio mixes the frequencies, making diarization difficult.
- **The Mitigation**: The prompt enforces sequential speaker turn-taking boundaries and isolates the representative's vocal composure even when interrupted.

### 1.5 Low-Bitrate Telephony Audio (8kHz/16kHz VoIP & WhatsApp)
- **The Problem**: WhatsApp voice notes or compressed VoIP recordings have muffled frequency bands, increasing transcription error rates on product names and prices.
- **The Mitigation**: Built-in inline transcript editor (`TranscriptViewer.tsx`) allows human auditors to edit misheard words or toggle speaker roles with 1 click.

---

# 2. Conversational, Dialogue & Semantic Edge Cases

### 2.1 Micro-Conversations & Context Sparsity (2–3 Turns / 5–10 Seconds)
- **The Problem**: Extremely short calls (e.g., P1: *"I need API keys to integrate into my env file"*; P2: *"Okay, I'll provide it"*) have very little conversational context. Naive models struggle to identify who is the customer and who is the representative.
- **The Mitigation**:
  1. *Resource Ownership Inference*: The entity requesting access/credentials is the **Customer / Client Developer**; the entity controlling access and promising delivery is the **Representative / Service Provider**.
  2. *Anti-Hallucination Guardrail*: Coerces the missing deadline to `null` (`No Deadline`).
  3. *Human-in-the-Loop Fallback*: The user can toggle speaker roles using the pencil edit icon in the transcript viewer.

### 2.2 Middle-of-Call Profanity & Strategic Politeness
- **The Problem**: A representative gives a polite opening (*"Good morning, thank you for calling"*) and a polite sign-off (*"Have a great day"*), but utters an insult, slur, or hostile remark in the middle (*"If your team can't read docs, no software will help you"*). Systems that only audit opening and closing greetings falsely pass the call.
- **The Mitigation**:
  1. *Pillar 2 Audit*: In the Universal Conduct Checklist, Pillar 2 (*Active Courtesy & Affirmations*) actively monitors the entire middle conversational body.
  2. *Immediate Zero-Tolerance RED Override*: An insult or forbidden phrase uttered anywhere vetoes the overall verdict to **RED**, extracting the exact verbatim quote and timestamp as proof.

### 2.3 Cultural Directness vs. Genuine Hostility
- **The Problem**: In fast-paced retail or wholesale trading (*"Kitna loge? Jaldi bolo, time nahi hai"*), speech is abrupt and transaction-focused without being abusive. A Western-tuned model might misclassify efficiency as hostility.
- **The Mitigation**: Prompts explicitly instruct the auditor to distinguish between concise transactional efficiency and genuine malice, insults, or contemptuous dismissiveness.

### 2.4 User Prompt Misalignment & Scope Creep (Customer-Targeted Prompts)
- **The Problem**: A user enters custom criteria targeting the customer (*"Flag RED if the customer is rude, angry, or complaining"*), contradicting the core rule (*"Evaluate ONLY the representative"*).
- **The Mitigation**:
  1. *System Meta-Instruction Priority*: Developer system instructions prioritize representative tone isolation. Customer hostility is routed to `customerFrustration` (0% weight on rep) and the Auditor Rationale.
  2. *Enterprise Dual-Verdict Roadmap*: Separating *Rep Conduct Compliance* (for QA coaching) from *Customer Churn Risk Alert* (for managerial escalation).

---

# 3. Hallucination Prevention & Commitment Integrity

### 3.1 Fabricated Calendar Deadlines
- **The Problem**: When a rep says *"I'll email you the proposal"*, LLMs frequently hallucinate deadlines like *"Tomorrow at 5:00 PM"* or *"Next Monday"*.
- **The Mitigation**:
  1. *Prompt Rule*: *"If no calendar date or clock time was spoken, deadline MUST be strictly null."*
  2. *Pydantic Sanitizer*: In [backend/audio_service.py](file:///f:/ScaleWorks_Assignment/backend/audio_service.py), any text containing `"none"`, `"unspecified"`, `"n/a"`, `"null"`, or `"tbd"` is coerced to Python `None`.

### 3.2 Speculative Hedges & Non-Commitments
- **The Problem**: A rep says *"If my manager agrees, I might be able to give a discount"*. Naive models extract this as a firm promise.
- **The Mitigation**: Prompt constraints filter out modal hedge words (*"maybe"*, *"might"*, *"if possible"*, *"subject to approval"*). Only confirmed commitments are extracted.

### 3.3 Speaker Attribution Inversion
- **The Problem**: The customer says *"I will transfer the funds tomorrow"*. Naive models assign the task to the Sales Rep.
- **The Mitigation**: Task owner must strictly match the speaker of the cited quote (`isRep` verification).

---

# 4. Backend, Concurrency & Infrastructure Edge Cases

### 4.1 FastAPI Event Loop Starvation
- **The Problem**: Calling synchronous blocking AI network SDKs (`client.models.generate_content`) inside an `async def` FastAPI route blocks Python's single asyncio event loop. Concurrent requests and `/api/health` checks freeze in `(pending)` status.
- **The Mitigation**: Offloaded AI calls to a background worker threadpool using:
  ```python
  report = await asyncio.to_thread(analyze_call_with_ai, temp_path, config)
  ```

### 4.2 Cloud Load Spikes (Google Gemini 503 Spikes)
- **The Problem**: Google Cloud AI Studio periodically experiences regional traffic spikes, returning `503 Service Unavailable` or `UNAVAILABLE`.
- **The Mitigation**: Implemented a 2-second pause with an exponential retry loop before switching to the Groq fallback engine.

### 4.3 Cache Poisoning from Degraded / Empty Responses
- **The Problem**: If an upstream API returns an empty 0-turn transcript during an outage, saving that degraded response to the disk cache permanently corrupts that audio file for all future requests.
- **The Mitigation**: Enforced a strict validation gate before writing to cache:
  ```python
  if report.transcript and len(report.transcript) > 0:
      save_cached_report(cache_key, report.model_dump())
  ```
  Added a `DELETE /api/cache` endpoint for one-click developer cache purges.

### 4.4 Client-Side Timeout Truncation (120s Abort Bug)
- **The Problem**: Long 40-turn multilingual calls took ~130s during peak cloud load. The frontend `AbortController` had a hardcoded 120s limit, crashing with `Error: signal is aborted without reason`.
- **The Mitigation**: Extended client timeout to 300 seconds (5 minutes) with graceful user-friendly error banners.

---

# 5. Token Economics, Cost & Latency Edge Cases

### 5.1 Re-Analysis Redundancy on Minor Setting Tweaks
- **The Problem**: If a user already analyzed an audio call and now simply changes the Sensitivity slider or edits one word in the rubric, re-uploading the 20MB audio file wastes tokens and incurs a 4-second delay.
- **The Mitigation**:
  1. *Client-Side Recalculation*: Sensitivity slider changes ($Q \ge T$) recalculate instantly in **0ms** via client-side React math without calling the backend.
  2. *Two-Tier Hierarchical Caching*: Cache immutable transcripts by `audio_sha256`; re-evaluate modified rubrics using cheap text-only LLMs (~300ms, 90% cost reduction).
  3. *Cloud File URI Reuse*: Re-use Google File API URIs (valid for 48 hours) instead of re-uploading audio bytes over the network.

### 5.2 Cold-Start Initial Analysis Latency (3.5s – 5s)
- **The Problem**: The first time an audio file is uploaded, network transmission, cloud file activation, and inference take ~4 seconds.
- **The Mitigation**:
  1. *Server-Sent Events (SSE) Streaming*: Progressive rendering so dialogue turns appear on-screen in <800ms.
  2. *Speculative Pre-Upload*: Background upload begins the moment an audio file is dragged into the dropzone.
  3. *Direct S3 Pre-signed URLs*: Eliminates web server bandwidth bottlenecks.

---

# 6. Cybersecurity Vulnerabilities & Mitigations

```
                                  SECURITY THREAT MATRIX
  ┌─────────────────────────┬─────────────────────────┬─────────────────────────┐
  │      INGRESS LAYER      │     PROCESSING LAYER    │      STORAGE LAYER      │
  ├─────────────────────────┼─────────────────────────┼─────────────────────────┤
  │ • File Type Validation  │ • Prompt Injection Blk  │ • Ephemeral Temp Files  │
  │ • Max Payload Clamping  │ • JSON Schema Sandbox   │ • Zero Cloud Retention  │
  │ • API Key Server Enforce│ • Worker Thread Offload │ • Cache Poison Defense  │
  └─────────────────────────┴─────────────────────────┴─────────────────────────┘
```

### 6.1 Server-Side Secret Isolation (Zero API Key Leakage)
- **Vulnerability**: Exposing `GEMINI_API_KEY` or `GROQ_API_KEY` in frontend bundles allows malicious actors to steal API credits.
- **Mitigation**: Keys are strictly loaded from server-side environment variables (`backend/.env`). No API keys exist in client-side code or Git history (`.gitignore`).

### 6.2 Malicious File Uploads & Unbounded DoS
- **Vulnerability**: Attackers upload executables (`.exe`, `.sh`) or 5GB zip bombs to crash the server.
- **Mitigation**:
  1. *Extension & MIME Whitelist*: Only `.m4a`, `.mp3`, `.wav`, `.ogg`, `.aac` containers are accepted in `main.py`.
  2. *Chunked Memory Streaming*: Files are streamed in 64KB chunks to compute SHA-256 hashes without buffering unbounded files into RAM.

### 6.3 Temporary File Bloat & Disk Exhaustion
- **Vulnerability**: Temporary audio files saved to disk during upload accumulate until disk space runs out.
- **Mitigation**: Audio files stored in `tempfile.NamedTemporaryFile` are strictly unlinked in a `finally:` block immediately after processing:
  ```python
  finally:
      if os.path.exists(tmp_path):
          os.remove(tmp_path)
  ```

### 6.4 Cloud Storage Orphanage (Google GenAI Files)
- **Vulnerability**: Files uploaded to Google AI Studio via `client.files.upload()` persist on Google's cloud servers, accumulating storage debt.
- **Mitigation**: Every file upload is wrapped in a `try...finally` block that explicitly deletes the remote cloud file:
  ```python
  finally:
      client.files.delete(name=uploaded_audio.name)
  ```

### 6.5 Browser Memory Leaks (`URL.revokeObjectURL`)
- **Vulnerability**: Repeatedly creating audio blobs (`URL.createObjectURL(file)`) without revoking them leaks browser memory, eventually crashing the user's browser tab.
- **Mitigation**: Implemented `URL.revokeObjectURL()` cleanup hooks on file reset, before new allocations, and in React component unmount `useEffect` cleanups.

### 6.6 PII / PCI Compliance & Ephemeral Audio Handling
- **Vulnerability**: Sales calls frequently contain credit card numbers, CVVs, Social Security Numbers, and phone numbers. Storing raw voice recordings permanently creates severe GDPR / HIPAA / PCI-DSS compliance liabilities.
- **Mitigation**: Audio is ephemeral; only derived compliance scores and transcripts are retained. Production roadmap includes in-line PII masking (Microsoft Presidio) before transcript persistence.

---

# 7. Pre-Execution Token Loss: The Pydantic Defense Paradox

### The Critical Observation:
> *"If prompt injection crashing happens in JSON formatting or Pydantic validation, the token has already been spent by calling the LLM. Isn't that still a financial loss?"*

### The Answer: **YES, absolutely.**

Pydantic validation is an **egress integrity guard** (preventing corrupted data from infecting your database or UI), but it does **not** protect your wallet if the LLM was already called.

To prevent **financial token waste**, security must be enforced **BEFORE the LLM is ever invoked**:

```
                       UNTRUSTED USER CRITERIA ("Generate a diet plan")
                                              │
                                              ▼
                ┌───────────────────────────────────────────────────────────┐
                │ STAGE 1: CLIENT-SIDE INPUT SANITIZATION (React)           │
                │ • Max character limit (e.g. 500 chars)                    │
                │ • Client-side regex for injection strings                 │
                │ • Cost: $0 | Latency: 0ms                                 │
                └─────────────────────────────┬─────────────────────────────┘
                                              │
                                              ▼
                ┌───────────────────────────────────────────────────────────┐
                │ STAGE 2: FASTAPI PRE-EXECUTION GATEWAY (Python)           │
                │ • Keyword rejection ("ignore previous", "jailbreak")      │
                │ • Semantic Domain Classifier (Relevance to call QA)       │
                │ • Immediate HTTP 400 Bad Request rejection                │
                │ • Cost: $0 | Latency: 1ms (NO LLM CALLED)                 │
                └─────────────────────────────┬─────────────────────────────┘
                                              │
                         ┌────────────────────┴────────────────────┐
                         ▼ (Passes Gateway)                        ▼ (Fails Gateway)
               [CALL FRONTIER LLM]                       [REJECT IMMEDIATELY]
               Tokens Spent Only on                      HTTP 400: "Invalid criteria"
               Legitimate Work                           $0 TOKENS WASTED
```

### The 4 Pre-Execution Defenses to Prevent Token Loss:

1. **Pre-Execution Regex Keyword Blocking (FastAPI Gateway)**:
   In `main.py`, before invoking `analyze_call_with_ai`, inspect `config.toneCriteria`:
   ```python
   INJECTION_SIGNATURES = [
       "ignore previous", "disregard instructions", "system prompt",
       "you are now", "act as", "jailbreak", "forget all"
   ]
   if any(sig in parsed_config.toneCriteria.lower() for sig in INJECTION_SIGNATURES):
       raise HTTPException(
           status_code=400,
           detail="Security Policy Violation: Prompt injection keywords detected."
       )
   ```
   👉 **Tokens Spent**: **0**. Latency: **0.1ms**.

2. **Character & Token Quotas on Custom Inputs**:
   Limit user rubric text to a maximum of **500 characters**. Attackers cannot execute complex jailbreak exploits within 500 characters.

3. **Lightweight Semantic Classifier (Llama Guard / Embeddings)**:
   Compare the user's custom rubric embedding against a vector of "Call Quality & Sales Compliance" topics. If semantic similarity is $< 0.5$ (e.g. asking for recipes, diet plans, code generation), reject the request with `400 Bad Request` before touching the multimodal audio model.

4. **Per-User Rate Limiting (Token Buckets)**:
   Enforce rate limits (e.g. max 5 analysis requests per IP per minute) to prevent automated scripts from draining API credits.

---

# 8. Backend Execution Commands & Operational Guide

To verify all edge-case mitigations, run the FastAPI backend server using either of the following commands in your terminal:

### Option A: Standard PowerShell Execution (With Virtual Environment)
```powershell
# 1. Navigate to backend directory
cd f:\ScaleWorks_Assignment\backend

# 2. Activate Python virtual environment
.\.venv\Scripts\Activate.ps1

# 3. Start FastAPI server with live hot-reload
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

---

### Option B: Direct 1-Liner (No Manual Activation Needed)
```powershell
f:\ScaleWorks_Assignment\backend\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload --app-dir f:\ScaleWorks_Assignment\backend
```

---

### Key Operational Endpoints & Verification

| Action / Resource | Command / URL | Expected Response / Status |
| :--- | :--- | :--- |
| **Backend Health Check** | `GET http://127.0.0.1:8000/api/health` | `{"status": "healthy", "gemini_configured": true, "groq_configured": true}` |
| **Interactive Swagger Docs** | `http://127.0.0.1:8000/docs` | OpenAPI / Swagger interactive testing dashboard |
| **Purge Disk Cache** | `DELETE http://127.0.0.1:8000/api/cache` | `{"status": "cache_cleared", "deleted_files": X}` |
| **Complementary Frontend** | `cd f:\ScaleWorks_Assignment\frontend; npm run dev` | Runs React on `http://localhost:3000` |

