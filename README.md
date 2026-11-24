# Sales Call Quality Analysis Agent
### ScaleWorks AI Engineering Assessment — Forward Deployed Engineer

An intelligent, multi-business web application that processes `.m4a` sales call recordings, performs speaker diarization (separating Representative from Customer), evaluates the sales representative's tone with evidence-grounded citations, extracts concrete commitments without hallucinating deadlines, and provides an in-app configurability panel for multiple industry domains.

---

## 🎯 Core Capabilities & Rubric Alignment

| Evaluation Area | Weight | Implementation Details |
| :--- | :---: | :--- |
| **Accuracy & Reliability** | **40%** | • **Isolated Representative Scoring**: Customer emotion is separated so representative is never unfairly penalized.<br>• **Evidence Grounding**: Every RED/GREEN verdict cites direct quotes with timestamps from the transcript.<br>• **Hallucination Prevention**: Commitments only include explicit promises; unstated deadlines remain `null` rather than fabricated.<br>• **Dual-Engine Resilience**: Primary multimodal processing via Gemini with automatic fallback to Groq (Llama-3.3) for rate-limit resilience. |
| **User Experience (UX)** | **30%** | • **Interactive Call Player**: Synced audio scrubber with playback speed controls (1x, 1.25x, 1.5x, 2x).<br>• **Clear Visual Hierarchy**: High-contrast RED / GREEN pill badges and multi-dimensional sentiment meters.<br>• **Searchable Transcript**: Filter dialogue by Sales Rep vs Customer or jump directly to timestamps.<br>• **Zero-Friction Quick Demos**: Built-in 1-click test cases for both compliant (GREEN) and violation (RED) calls. |
| **Configurability** | **30%** | • **Multi-Business Presets**: Switch instantly between *B2B SaaS Sales*, *Financial Recovery / Debt Collection*, *Real Estate & Advisory*, and *Custom Rubric* without changing code.<br>• **Sensitivity Slider**: Choose between `Low`, `Balanced`, and `Strict` flag thresholds.<br>• **Action Item Scope**: Configurable from strict time-bound commitments to broad next steps.<br>• **Custom Monitored Terms**: Define organization-specific forbidden phrases and compliance triggers. |

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

The assignment requires at least two representative test calls:
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
MIT License. Built for ScaleWorks AI Engineering Assessment.
