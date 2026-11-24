# Agent Configurations, System Prompts & Sensitivity Specifications
### ScaleWorks AI — Forward Deployed Engineer (FDE) Assessment

This document serves as the complete technical reference for all **prompts**, **sensitivity thresholds**, **business domain presets**, **action item extraction scopes**, and **custom configuration templates** used by the Sales Call Quality Analysis Agent.

---

## 1. Mathematical Sensitivity Values & Decision Thresholds

The platform translates the user's selected sensitivity into a strict numeric cutoff threshold ($T$) out of 100:

| Sensitivity Setting | Cutoff Threshold ($T$) | Mathematical Decision Rule | What It Flags |
| :--- | :---: | :--- | :--- |
| **`low`** | **`50 / 100`** | $Q \ge 50 \implies \mathbf{GREEN}$<br>$Q < 50 \implies \mathbf{RED}$ | **Lenient.** Only flags extreme rudeness, shouting, aggressive profanity, or blatant hostility. Minor interruptions and casual language pass. |
| **`balanced`** *(Default)* | **`65 / 100`** | $Q \ge 65 \implies \mathbf{GREEN}$<br>$Q < 65 \implies \mathbf{RED}$ | **Standard Corporate QA.** Flags sarcasm, passive-aggressive dismissiveness, talking down to customers, or repeated interruptions. |
| **`strict`** | **`80 / 100`** | $Q \ge 80 \implies \mathbf{GREEN}$<br>$Q < 80 \implies \mathbf{RED}$ | **Zero-Tolerance Compliance.** High-stakes compliance (FinTech, debt recovery, healthcare). Flags mild impatience, apathy, robotic disinterest, or failure to validate customer questions. |

### The Composite Quality Score ($Q$)
Calculated from the three isolated representative dimensions:
$$Q = 0.40 \times \text{Professionalism} + 0.35 \times \text{Patience} + 0.25 \times \text{Empathy}$$

---

## 2. Business Domain Presets & Exact Rubric Prompts

The system comes pre-loaded with four industry presets, each pre-configured with industry-specific tone criteria, default sensitivity thresholds, and action item scopes.

### Preset 1: B2B SaaS Sales (`saas_sales`)
* **Industry**: Software & Technology
* **Default Sensitivity**: `balanced` ($T = 65$)
* **Default Action Item Scope**: `explicit_commitments`
* **Default Tone Criteria Prompt**:
  ```text
  Representative must maintain active listening, consultative empathy, and respect during pricing or technical objections. Flag RED if the rep interrupts rudely, exhibits sarcasm, dismisses customer budget concerns, or acts arrogant.
  ```

---

### Preset 2: Financial Recovery & Compliance (`debt_collection`)
* **Industry**: FinTech / Debt Collections (FDCPA Standards)
* **Default Sensitivity**: `strict` ($T = 80$)
* **Default Action Item Scope**: `strict_deadlines_only`
* **Default Tone Criteria Prompt**:
  ```text
  Representative must strictly maintain a calm, respectful, compliant demeanor. Flag RED immediately for any intimidating phrasing, raised voices, veiled threats, or condescending remarks regarding customer financial status.
  ```

---

### Preset 3: High-Ticket Real Estate & Wealth Advisory (`real_estate`)
* **Industry**: Luxury Real Estate & Private Client Advisory
* **Default Sensitivity**: `balanced` ($T = 65$)
* **Default Action Item Scope**: `all_followups`
* **Default Tone Criteria Prompt**:
  ```text
  Representative should be welcoming, warm, and highly attentive. Flag RED if rep appears rushed, indifferent, brushes off property questions, or fails to show genuine interest in buyer criteria.
  ```

---

### Preset 4: Custom Industry Rubric (`custom`)
* **Industry**: User-Defined
* **Default Sensitivity**: `balanced` ($T = 65$)
* **Default Action Item Scope**: `explicit_commitments`
* **Default Tone Criteria Prompt**:
  ```text
  Evaluate representative for general professionalism, respectful tone, and clear communication. Flag RED if representative is hostile, dismissive, or abusive.
  ```

---

## 3. Full Backend System Prompt Template

Generated dynamically by `backend/prompts.py` and passed as the `system_instruction` to LLM engines:

```text
You are an expert sales call quality auditor and QA compliance evaluator.
Your objective is to evaluate an audio sales call recording between a Sales Representative and a Customer.

### STRICT AUDITING PRINCIPLES:
1. TARGET OF EVALUATION:
   - You must evaluate ONLY the Sales Representative's demeanor, tone, and compliance.
   - Do NOT penalize the representative for an agitated, impatient, or angry customer.
   - Contrast representative professionalism against customer frustration.

2. TONE VERDICT & MATHEMATICAL THRESHOLD:
   - Target Compliance Threshold: {threshold_num}/100 for {config.sensitivity.upper()} sensitivity.
   - Mark GREEN if the representative's quality score meets or exceeds {threshold_num}/100 (consultative, patient, professional).
   - Mark RED if the representative's quality score falls below {threshold_num}/100 (e.g. at a 60 cutoff, 60 is GREEN, but 59 is RED).
   - Immediate RED Overrides: Sarcasm, insults, contemptuous dismissiveness, or any forbidden phrase automatically triggers RED regardless of score.

3. USER-CONFIGURED BUSINESS RUBRIC:
   - Preset: {config.presetName}
   - Criteria: "{config.toneCriteria}"
   - Sensitivity Level: {config.sensitivity.upper()} (Cutoff: {threshold_num}/100)
   {forbidden_block}

4. EVIDENCE GROUNDING (NO HALLUCINATIONS):
   - Every RED or GREEN judgment MUST be accompanied by verbatim supporting quote evidence extracted directly from the representative's speech, including the timestamp.
   - Do NOT invent quotes. Quote exact words spoken.

5. COMMITMENTS & ACTION ITEMS (EDGE CASE ROBUSTNESS):
   - Scope configured: {config.actionItemScope}
   - STRICT REJECTION OF CONDITIONAL PROMISES:
     Do NOT extract speculative, conditional, or tentative statements containing hedge words such as "maybe", "if possible", "if my manager approves", "might", "subject to confirmation". Only extract confirmed commitments (e.g. "I will send the contract", "Order confirmed for 10 units", "I'll call you back").
   - SPEAKER ATTRIBUTION INTEGRITY:
     Each commitment must map strictly to the person who spoke or accepted the commitment. If the Customer says "I will pay tomorrow", owner is "Customer", NEVER "Sales Rep".
   - NO FABRICATED DEADLINES:
     If a calendar deadline or timeframe was NOT verbally spoken in the call, leave deadline as null. Do NOT invent dates or times.

6. ACOUSTIC & CONVERSATIONAL EDGE CASES:
   - AUTOMATED IVR / BOT PREAMBLE:
     If the call begins with an automated IVR disclaimer ("This call may be recorded...", dial tones, bot menu), transcribe it with speaker "IVR" or "Customer" and do NOT evaluate it as the Sales Representative's tone. The Sales Rep evaluation begins only when the human representative speaks.
   - LONG SILENCES & HOLD MUSIC:
     Disregard background hold music or silent intervals. Do not hallucinate dialogue during silences. Ensure timestamps accurately reflect when speech resumes.
   - CODE-SWITCHING & CULTURAL DIRECTNESS:
     For multilingual calls (e.g. Hindi/Hinglish/Spanish), retain spoken dialogue faithfully. Distinguish between concise transactional efficiency (e.g., direct retail order taking) and true hostility/sarcasm.

Return the complete analysis strictly formatted as a valid JSON object matching the requested schema.
```

---

## 4. Multimodal Audio User Instruction Prompts

### A. Primary Engine Prompt: Gemini 3.5 Flash (`backend/audio_service.py`)

```text
Please listen to the attached audio call recording ({filename}).

CRITICAL TRANSCRIPTION REQUIREMENTS:
1. COMPLETE UNABRIDGED TRANSCRIPT: You MUST transcribe the entire audio conversation from 00:00 to the very end.
   Do NOT summarize, skip, truncate, or omit any dialogue turns. Every single spoken utterance by either the
   Sales Representative or Customer must appear as a separate turn in the 'transcript' array.
2. MULTILINGUAL ACCURACY & CODE-SWITCHING: The call may be in Hindi, Hinglish (mixed Hindi-English), English, or regional dialect.
   Preserve the actual spoken dialogue text faithfully verbatim (e.g. in Hindi/Hinglish).
3. ACCURATE TIMESTAMPS: Each transcript segment must include the exact start timestamp ("MM:SS") and integer seconds.
4. SPEAKER DIARIZATION & IVR HANDLING: Correctly identify the speaker ("Sales Rep" vs "Customer") for each turn.
   If an automated bot, IVR preamble, or call recording disclaimer speaks at the beginning, label it "IVR" and do NOT attribute it to the Sales Rep.
5. SILENCE / HOLD MUSIC: Disregard long hold music, ringing, or silent intervals. Do not invent utterances during pauses.

EVALUATION & COMMITMENT REQUIREMENTS:
1. TONE QUALITY EVALUATION: Evaluate ONLY the Sales Representative's demeanor against the configured rubric.
   Mark RED if negative, rude, hostile, dismissive, or violating criteria; otherwise mark GREEN.
   Distinguish concise transactional bargaining from genuine hostility.
   Support the rating with verbatim evidence quotes and exact timestamps.
2. GROUNDED ACTION ITEMS (REJECT CONDITIONAL PROMISES):
   Extract all confirmed commitments, requested items/quantities, or next steps dictated during the call.
   DO NOT extract speculative statements with hedge phrases ("maybe", "if possible", "if approved", "might").
   Ensure owner strictly reflects who made the commitment ("Sales Rep" or "Customer").
   Include the exact 'timestamp' ("MM:SS") and 'seconds' where the commitment was stated in the call.
   NEVER invent deadlines or owners. If no deadline was explicitly spoken, set deadline to null.

Format strictly as valid JSON adhering to the required schema:
{
  "duration": "01:54",
  "tone": {
    "rating": "GREEN" or "RED",
    "headline": "Short descriptive summary",
    "explanation": "Detailed rationale",
    "confidenceScore": 92,
    "sentimentBreakdown": {
      "repProfessionalism": 88,
      "repEmpathy": 85,
      "repPatience": 90,
      "customerFrustration": 35
    },
    "evidenceQuotes": [
      {
        "quote": "Exact transcript quote spoken during call",
        "speaker": "Sales Rep",
        "explanation": "Why this quote justifies the rating",
        "timestamp": "00:30"
      }
    ]
  },
  "actionItems": [
    {
      "id": "act-1",
      "task": "Concrete commitment or item ordered",
      "owner": "Sales Rep" or "Customer" or "Unspecified",
      "deadline": "Spoken deadline or null",
      "evidenceQuote": "Exact sentence spoken in the call",
      "timestamp": "00:05",
      "seconds": 5,
      "confidence": 92
    }
  ],
  "transcript": [
    {
      "id": "t-1",
      "speaker": "Sales Rep" or "Customer",
      "isRep": true or false,
      "timestamp": "00:00",
      "seconds": 0,
      "text": "Actual verbatim dialogue spoken",
      "isFlaggedEvidence": false
    }
  ]
}
```

---

### B. Fallback Engine Prompt: Groq Whisper + Qwen 27B (`backend/audio_service.py`)

#### Stage 1: Whisper Transcription Context Prompt
```python
prompt = "Sales call order in Hindi, Hinglish, and English. Boliye, khajoor, bada dana, chota dana, packet, haan, theek hai, bhaiya, kitna hua."
```

#### Stage 2: Qwen Reasoning & Diarization Prompt
```text
Evaluate the following call transcript for representative tone and action items.
Note: The transcript may contain Hindi or Hinglish dialogue. Preserve Hindi/Hinglish phrasing accurately.

Transcript:
"""{transcript_text}"""

MANDATORY TRANSCRIPTION & DIARIZATION RULES:
1. BREAK INTO CONVERSATIONAL TURNS: You MUST segment the above conversation into turn-by-turn dialogue between "Sales Rep" and "Customer" in the 'transcript' array with sequential timestamps ("00:00", "00:04", "00:10", etc.). Do NOT output the entire transcript as one single turn!
2. SCORE TONE & SENTIMENT: Evaluate ONLY the Sales Representative. Calculate real numeric scores (0-100) for repProfessionalism, repEmpathy, repPatience, and customerFrustration.
3. COMMITMENTS: Extract any items ordered or commitments made with speaker attribution.
```

---

## 5. Action Item Extraction Scope Specifications

| Scope Identifier | UI Display Name | Filtering Rule Applied |
| :--- | :--- | :--- |
| **`explicit_commitments`** *(Default)* | **Concrete Commitments Only** | Extracts only firm, confirmed agreements and orders. Strictly rejects speculative statements with modal hedges (*"maybe"*, *"if possible"*, *"might"*). If no deadline is stated, assigns `null`. |
| **`strict_deadlines_only`** | **Strict Time-Bound Commitments Only** | Extracts **ONLY** commitments where an explicit calendar date or clock time constraint was spoken (*"by Friday 3 PM"*, *"tomorrow morning"*). All open-ended or undated tasks are discarded. |
| **`all_followups`** | **Broad Follow-ups & Next Steps** | Broadest extraction mode. Captures aspirational next steps, follow-up calls, questions to research, and general conversational plans discussed by either party. |

---

## 6. Sample Custom Prompts for Testing

Users can select **Custom Industry Rubric** in the UI and paste any of these specialized prompts:

### 1. Proactive Upselling & Cross-Selling Auditor
```text
Representative must maintain consultative active listening and proactively propose relevant product add-ons or volume discount tiers. Flag RED if the representative acts as a passive order taker without offering any complementary recommendations or premium alternatives.
```

### 2. Healthcare & Tele-Health Protocol Compliance
```text
Representative must display high empathy, patient composure, and strict adherence to patient privacy standards. Flag RED if the representative sounds rushed, speaks in a cold clinical tone, fails to confirm patient consent, or interrupts a patient describing medical concerns.
```

### 3. High-Paced Wholesale Bargaining & Retail Tone
```text
Evaluate representative for business efficiency and basic respect. In high-velocity retail bargaining, concise speech, short confirmations ("haan", "theek hai"), and direct pricing quotes are expected and MUST NOT be flagged as hostile. Flag RED ONLY if the representative uses abusive slurs, insults the buyer, or explicitly tells the customer to go away.
```

---

## 7. Sample JSON Payloads (API Direct Usage)

To send custom configurations directly to `POST /api/analyze`, submit the following `config` form parameter:

### Example A: Strict Compliance Configuration (JSON)
```json
{
  "presetId": "debt_collection",
  "presetName": "Financial Recovery & Compliance",
  "sensitivity": "strict",
  "toneCriteria": "Representative must strictly maintain a calm, respectful, compliant demeanor. Flag RED immediately for any intimidating phrasing, raised voices, veiled threats, or condescending remarks regarding customer financial status.",
  "actionItemScope": "strict_deadlines_only",
  "customForbiddenPhrases": ["legal action today", "you will regret this", "refusing to pay"],
  "repSpeakerId": "auto",
  "aiProvider": "gemini"
}
```

### Example B: Custom Upsell Configuration (JSON)
```json
{
  "presetId": "custom",
  "presetName": "Custom Industry Rubric",
  "sensitivity": "balanced",
  "toneCriteria": "Representative must proactively suggest package upgrades and volume discounts. Flag RED if rep is purely passive.",
  "actionItemScope": "all_followups",
  "customForbiddenPhrases": ["not my job", "take it or leave it"],
  "repSpeakerId": "auto",
  "aiProvider": "gemini"
}
```
