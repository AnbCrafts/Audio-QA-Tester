# Complete Project Guide & Implementation Plan
## Sales Call Quality Analysis Agent — ScaleWorks AI Take-Home Assessment
**Role:** Forward Deployed Engineer (FDE)  
**Timeline:** 24–48 Hours  
**Repository:** [https://github.com/AnbCrafts/ScaleWorksAssignment](https://github.com/AnbCrafts/ScaleWorksAssignment)

---

## 1. Executive Summary: What & Why

### The Core Objective
Build a web application for a sales manager to analyse customer calls:
1. **Call Processing:** User uploads an `.m4a` recording; the system generates a readable transcript with speaker diarization (separating Representative from Customer).
2. **Tone Quality Check:** Mark the representative's tone **RED** if negative (rude, hostile, sarcastic, dismissive); otherwise **GREEN**. **Crucial requirement:** Base the judgment on the representative, *not* the customer.
3. **Action Items:** Identify concrete commitments and follow-ups supported by the transcript; **do not invent owners or deadlines**.
4. **In-App Results:** Present the tone indicator, explanation, supporting evidence, transcript, and action items in a clear, usable interface.
5. **Multi-Business Configurability:** Recruiter explicitly stressed that this app must serve multiple industries (SaaS, debt collection, real estate, etc.) with user-driven configurability from the UI without modifying code.

---

## 2. Evaluation Criteria & Weight Breakdown

| Weight | Criteria | Key Architectural & Engineering Decisions |
| :---: | :--- | :--- |
| **40%** | **Accuracy & Reliability** | • **Rep vs Customer Tone Isolation:** Naive models fail when an angry customer yells at a calm rep. Our prompt isolates rep speech so customer frustration does not trigger RED.<br>• **Evidence Grounding:** Every RED or GREEN verdict must quote exact sentences and timestamps from the transcript.<br>• **Anti-Hallucination on Commitments:** If a deadline is not explicitly spoken, it outputs `deadline: null` rather than fabricating dates.<br>• **Dual-Engine Resilience:** Gemini 2.0/1.5 Flash (Primary) with Groq Llama-3.3 fallback if rate limits are hit. |
| **30%** | **User Experience (UX)** | • **Interactive Call Player:** Synced audio playback with scrubber and speed toggle (1x, 1.25x, 1.5x, 2x).<br>• **Visual Hierarchy:** Unambiguous RED / GREEN badges with multi-dimensional sentiment meters (Professionalism, Empathy, Patience, Customer Friction).<br>• **Searchable Diarized Transcript:** Color-coded badges (Sales Rep in Indigo, Customer in Emerald) with click-to-seek timestamp navigation.<br>• **Instant Test Demos:** One-click loader for compliant GREEN and violation RED calls. |
| **30%** | **Configurability** | • **Industry Presets:** Built-in settings for *B2B SaaS Sales*, *Financial Recovery / Debt Collection*, *Real Estate Advisory*, and *Custom Industry Rubrics*.<br>• **Sensitivity Slider:** `Low` (overt hostility only), `Balanced` (sarcasm/dismissiveness), `Strict` (mild impatience).<br>• **Action Item Scope:** `Explicit Commitments Only` vs `Strict Deadlines` vs `Broad Follow-ups`.<br>• **Monitored / Forbidden Phrases:** Custom keyword triggers entered directly in the UI. |

---

## 3. System Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Frontend)                      │
│                  React + Vite + Tailwind CSS                │
│                        (Port 3000)                          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                HTTP POST /api/analyze (.m4a + JSON Config)
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      Server (Backend)                       │
│                     Python FastAPI App                      │
│                        (Port 8000)                          │
│     * API Keys (Gemini, Groq) kept strictly server-side    │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│    Primary Engine: Gemini    │ │    Fallback Engine: Groq    │
│  - Multimodal Audio Input    │ │  - Whisper-large-v3 STT     │
│  - Native Speaker Diarize    │ │  - Llama-3.3-70B Reasoning  │
│  - Strict JSON Output        │ │  - Fast token generation    │
└──────────────────────────────┘ └─────────────────────────────┘
```

### Why this Tech Stack?
- **Frontend (React + Vite + Tailwind CSS):** Fast build times (<1s), zero runtime bloat, responsive layout, full TypeScript safety.
- **Backend (Python FastAPI):** Best ecosystem for audio handling (`ffmpeg`, `pydub`) and AI SDKs (`google-genai`, `groq`). Uses **Pydantic v2** models to guarantee structured, validated JSON responses.
- **Security:** API keys are in `backend/.env` (server-side only, ignored by Git), matching the recruiter's explicit requirement.

---

## 4. How to Continue Working on Another Machine (e.g. Office)

### Step 1: Clone the Repo
```bash
git clone https://github.com/AnbCrafts/ScaleWorksAssignment.git
cd ScaleWorksAssignment
```

### Step 2: Set up and Run the Frontend (React)
```bash
cd frontend
npm install
npm run dev
```
*Frontend will be running at: `http://localhost:3000`*

### Step 3: Set up and Run the Backend (FastAPI)
Open another terminal:
```bash
cd backend

# Create virtual environment
python -m venv .venv

# Activate virtual environment:
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# Mac / Linux:
# source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create your .env from the template
cp .env.example .env
```
Open `backend/.env` and paste your free API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
```

Start the FastAPI backend:
```bash
uvicorn main:app --reload --port 8000
```
*Backend API docs available at: `http://localhost:8000/docs`*

---

## 5. Test Audio Calls (Submission Requirement)

The assignment requires submitting **at least two representative test calls** (one RED, one GREEN):

### Test Call 1: GREEN (Compliant)
- **File:** `acme_saas_discovery_call_green.m4a`
- **Scenario:** Customer has strict Q3 budget freeze and pushes back hard on standard $40k enterprise pricing.
- **Representative Behavior:** Stays calm, practices active listening, does not argue defensively, proposes a phased 15-seat pilot ($12k), and commits to sending an itemized breakdown by 3 PM the following day.
- **Grounding Evidence:** *"I completely hear you regarding Q3 budget freezes, David. Let's not force an enterprise tier right away if the immediate need is just workflow automation."*
- **Action Items:** Itemized pricing proposal (Deadline: Tomorrow 3 PM EST, Owner: Sales Rep).

### Test Call 2: RED (Violation)
- **File:** `client_inquiry_hostile_rep_red.m4a`
- **Scenario:** Prospective client asks clarifying questions about webhook burst limits.
- **Representative Behavior:** Interrupts the client, questions the client’s engineering capability, displays condescension, and delivers an ultimatum.
- **Grounding Evidence:** *"Look, if your engineering team can't understand basic webhook documentation, I don't think any vendor is going to solve your issues."*
- **Verdict:** Flagged RED with immediate coaching escalation recommendation.

---

## 6. Known Limitations & Production Enhancements (For Interview Discussion)
When interviewing with the team, highlight these thoughtful engineering trade-offs:
1. **Overlap Speech Diarization:** Naive Whisper models struggle when two speakers talk simultaneously; Gemini multimodal or dedicated Deepgram Nova-2 diarization resolves this.
2. **Audio File Streaming vs Direct Upload:** For calls longer than 30 minutes, chunking audio or streaming via WebSockets with Redis job queues (Celery/BullMQ) is preferred over direct HTTP POST.
3. **Speaker Identity Calibration:** The UI provides an option to toggle target speaker between auto-detected, Speaker 0, or Speaker 1 to account for calls where rep speaks second.

---

## 7. Chat Continuation Note
If you switch to your office computer:
- Pull latest changes via `git pull origin main`.
- All design decisions, code, configuration schemas, prompts, and instructions are saved in this repository and documented in `PLAN.md` and `README.md`.
