# Evaluation Thresholds, Scoring Formulas & Business Categories
### ScaleWorks AI — Forward Deployed Engineer (FDE) Assessment

This document provides a comprehensive technical reference for how **tone quality scores**, **decision boundaries**, **sensitivity thresholds**, **business preset rubrics**, and **action item extraction scopes** are mathematically calculated and evaluated within the platform.

---

## 1. Mathematical Scoring Formula

The tone evaluation engine isolates the **Sales Representative's** performance across three core quality dimensions, while measuring **Customer Friction** independently to ensure customer hostility does not unfairly penalize the representative.

### Overall Representative Quality Score ($Q$)
The Composite Quality Score is a weighted multi-dimensional index calculated out of 100:

$$Q = 0.40 \times \text{Professionalism} + 0.35 \times \text{Patience} + 0.25 \times \text{Empathy}$$

| Metric | Weight | Evaluation Criteria |
| :--- | :---: | :--- |
| **Professionalism** | **40%** | Respectful communication, consultative vocabulary, composure during pricing or technical objections, active listening. |
| **Patience / Composure** | **35%** | Allowing the customer to finish speaking without interrupting, pacing, staying calm when customer repeats questions or expresses hesitation. |
| **Consultative Empathy** | **25%** | Acknowledging budget constraints, validating business pain points, seeking collaborative solutions rather than high-pressure tactics. |
| **Customer Friction** *(Isolated)* | **0%** *(Contrast Metric)* | Quantifies customer anger, doubt, or hesitation. Evaluated solely to provide contrast and prove the representative maintained composure despite client hostility. |

---

## 2. Sensitivity Thresholds & Decision Boundaries

The final binary verdict (**`GREEN` Compliant** vs **`RED` Violation**) is determined by evaluating $Q$ against the active **Sensitivity Cutoff Threshold ($T$)**:

$$\text{Verdict} = \begin{cases} \mathbf{GREEN} \text{ (Compliant)}, & \text{if } Q \ge T \\ \mathbf{RED} \text{ (Violation)}, & \text{if } Q < T \end{cases}$$

### Configured Sensitivity Levels

| Sensitivity Level | Numeric Cutoff ($T$) | Audit Character | What It Flags |
| :--- | :---: | :--- | :--- |
| **Low Sensitivity** | **$50 / 100$** | **Lenient** | Only flags severe violations: shouting, direct insults, aggressive profanity, or blatant hostility. |
| **Balanced Sensitivity** *(Default)* | **$65 / 100$** | **Standard Corporate QA** | Standard B2B sales benchmark. Flags sarcasm, passive-aggressive dismissiveness, talking down to customers, or repeated interruptions. |
| **Strict Sensitivity** | **$80 / 100$** | **Zero-Tolerance Compliance** | High-stakes compliance (e.g. debt collection, healthcare, luxury advisory). Flags minor impatience, apathy, or failure to validate customer questions. |

### Concrete Boundary Example: If Cutoff is $60/100$
- **$Q = 60/100$**: Flagged as **`GREEN` (Pass / Compliant)** — meets the minimum compliance boundary.
- **$Q = 59/100$**: Flagged as **`RED` (Fail / Violation)** — fell below the boundary by 1 point. The engine outputs verbatim evidence quotes citing where the representative lost composure.

---

## 3. Automatic Immediate RED Overrides (Zero-Tolerance Rules)

Regardless of the composite score $Q$, the engine executes a hard veto that overrides the verdict to **`RED`** if any of the following occur:

1. **Direct Insults & Derogatory Remarks**:
   * Example: *"If your team can't read docs, no software will help you."*
2. **Aggressive Hang-Ups & Abrupt Abandonment**:
   * Terminating a call in frustration without a professional sign-off.
3. **Forbidden Phrase Violation**:
   * Uttering any word or phrase explicitly added to the user-configured **Custom Monitored Phrases** list (e.g., *"not my problem"*, *"take it or leave it"*, *"I already told you"*).
4. **Regulatory Non-Compliance** *(e.g., in Debt Collection)*:
   * Threatening illegal actions, unauthorized disclosure of debt to third parties, or refusing to state mandatory disclosure language.

---

## 4. Multi-Business Presets & Industry Rubrics

The platform dynamically adapts its system prompts and evaluation criteria to four pre-built industry presets:

```
                  ┌──────────────────────────────────────────────┐
                  │          Business Preset Selector            │
                  └──────────────────────┬───────────────────────┘
                                         │
         ┌──────────────────┬────────────┴───────┬──────────────────┐
         ▼                  ▼                    ▼                  ▼
┌──────────────────┐┌──────────────────┐┌──────────────────┐┌──────────────────┐
│   B2B SaaS Sales ││ Debt Collection  ││ Real Estate/Adv. ││ Custom Industry  │
│ Threshold: T=65  ││ Threshold: T=80  ││ Threshold: T=70  ││ User-Configured  │
└──────────────────┘└──────────────────┘└──────────────────┘└──────────────────┘
```

### 1. B2B SaaS Sales (`saas_sales`)
* **Default Threshold**: $T = 65$ (Balanced)
* **Default Scope**: `explicit_commitments`
* **Core Rubric**:  
  > *"Representative must maintain active listening, consultative empathy, and respect during pricing or technical objections. Flag RED if the rep interrupts rudely, exhibits sarcasm, dismisses customer budget concerns, or acts arrogant."*
* **Typical Monitored Phrases**: `"take it or leave it"`, `"can't help you"`, `"read the manual"`.

### 2. Financial Recovery & Compliance (`debt_collection`)
* **Default Threshold**: $T = 80$ (Strict)
* **Default Scope**: `strict_deadlines_only`
* **Core Rubric**:  
  > *"Zero-tolerance compliance audit under FDCPA guidelines. Rep must never harass, threaten, use abusive language, or misrepresent legal rights. Flag RED immediately on any aggressive cadence, condescending remarks, or unauthorized threats."*
* **Typical Monitored Phrases**: `"you're going to regret this"`, `"legal action today"`, `"refusing to pay"`.

### 3. High-Ticket Real Estate & Wealth Advisory (`real_estate`)
* **Default Threshold**: $T = 70$ (Balanced/Elevated)
* **Default Scope**: `all_followups`
* **Core Rubric**:  
  > *"Representative must deliver luxury client-advisory decorum, clear valuation explanations, and unhurried patience. Flag RED if the rep appears pushy, speaks over the client, or shows irritation when explaining contract clauses."*
* **Typical Monitored Phrases**: `"wasting my time"`, `"that's cheap for this area"`.

### 4. Custom Industry Rubric (`custom`)
* **Default Threshold**: User selectable (Low, Balanced, Strict)
* **Core Rubric**: User-authored freeform prompt injected directly into the LLM system prompt. Supports custom monitored phrase lists and custom scopes without code modification.

---

## 5. Action Item & Commitment Extraction Scopes

To prevent hallucinated deadlines or speculative promises from contaminating CRM systems, commitments are filtered through three selectable extraction scopes:

```
                                  Action Item Scopes
    ┌───────────────────────────┬───────────────────────────┬───────────────────────────┐
    │  explicit_commitments     │   strict_deadlines_only   │       all_followups       │
    │  (Recommended Default)    │   (High Compliance)       │   (Exploratory)           │
    ├───────────────────────────┼───────────────────────────┼───────────────────────────┤
    │ Extracts firm, modal      │ ONLY extracts tasks with  │ Includes exploratory and  │
    │ promises ("I will send",  │ explicit calendar dates or│ conversational next steps │
    │ "Order 10 units").        │ times ("by Friday 3 PM"). │ discussed by both parties.│
    │ Rejects conditional hedges│ Speculative & undated     │ Still grounds quotes in   │
    │ ("maybe", "if possible"). │ tasks are discarded.      │ transcript.               │
    └───────────────────────────┴───────────────────────────┴───────────────────────────┘
```

### Edge Case Constraints Enforced on Extraction:
1. **Rejection of Speculative / Conditional Hedges**:
   * Statements containing *"maybe"*, *"if my manager approves"*, *"if possible"*, or *"might"* are strictly rejected unless explicitly confirmed later in the call.
2. **Speaker Attribution Integrity**:
   * An action item is strictly assigned to the speaker who spoke the promise. If a customer says *"I will wire the deposit on Monday"*, the owner is assigned as `Customer`, never `Sales Rep`.
3. **No Fabricated Deadlines**:
   * If a calendar date or time boundary was not explicitly spoken in the dialogue, `deadline` is assigned `null` (displayed as `No Deadline` in the UI).

---

## 6. Architecture & Dual-Engine Failover

```
                         Uploaded .m4a Audio
                                 │
                                 ▼
                     SHA-256 Composite Hashing
                  (Audio Bytes + Config Settings)
                                 │
                 ┌───────────────┴───────────────┐
                 │ Cache Hit? (Disk cache/ exists)│
                 └───────┬───────────────┬───────┘
                     YES │               │ NO
                         ▼               ▼
                  Return Cached      Dual AI Inference
                  Report (0ms)           Pipeline
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [Primary Engine]                [Fallback Engine]
                 Gemini 3.5 Flash                Groq Inference
                 - Native Multimodal Audio       - Whisper Large v3 Turbo
                 - Direct Hindi/Hinglish ASR     - Hindi Context Prompts
                 - Turn-by-Turn Diarization      - Qwen 27B Reasoning
                         │                               │
                         └───────────────┬───────────────┘
                                         ▼
                             Pydantic Schema Validation
                             (Scores clamped 0-100,
                              evidence quotes verified)
                                         │
                                         ▼
                            Interactive React Dashboard
```

---

## 7. Summary Table of Decision Rules

| Condition | Verdict | Justification |
| :--- | :---: | :--- |
| $Q \ge T$ and no veto triggers | **`GREEN`** | Meets or exceeds the quality score required by the active sensitivity cutoff. |
| $Q < T$ | **`RED`** | Fails the quality cutoff threshold ($T$) for the configured business preset. |
| Rep uses insulting or abusive language | **`RED`** | Automatic immediate override. |
| Rep uses a phrase in Custom Forbidden Phrases | **`RED`** | Automatic immediate override. |
| Customer is rude, but Rep remains composed ($Q \ge T$) | **`GREEN`** | Strict target isolation: customer hostility is recorded under *Customer Friction* without penalizing rep professionalism. |
