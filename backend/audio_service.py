import os
import json
import time
from typing import Tuple
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    ToneAnalysisResult,
    ActionItem,
    TranscriptSegment,
    EvidenceQuote,
    SentimentBreakdown,
)
from prompts import build_system_prompt

# Check available API keys
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GROQ_KEY = os.getenv("GROQ_API_KEY", "").strip()

def analyze_call_with_ai(file_path: str, filename: str, file_size_str: str, config: AnalysisConfigInput) -> AnalysisReport:
    """
    Dual-engine audio analysis pipeline:
    1. Attempts Gemini (multimodal native audio processing & diarization)
    2. Falls back to Groq if Gemini hits rate limits or is unconfigured
    3. Raises clear error if both fail (No static/fake data)
    """
    system_prompt = build_system_prompt(config)
    gemini_error = None
    groq_error = None

    # 1. Try Gemini
    if GEMINI_KEY:
        try:
            return _call_gemini(file_path, filename, file_size_str, config, system_prompt)
        except Exception as e:
            gemini_error = str(e)
            print(f"[Warning] Gemini call failed: {e}. Attempting Groq fallback...")

    # 2. Try Groq fallback
    if GROQ_KEY:
        try:
            return _call_groq(file_path, filename, file_size_str, config, system_prompt)
        except Exception as e:
            groq_error = str(e)
            print(f"[Warning] Groq call failed: {e}.")

    # If neither succeeded, raise clear real error (no fake data)
    err_msg = "AI Analysis failed to process audio recording."
    if gemini_error and groq_error:
        err_msg = f"Both engines failed. Gemini: {gemini_error[:120]} | Groq: {groq_error[:120]}"
    elif gemini_error:
        err_msg = f"Gemini engine error: {gemini_error[:180]}"
    elif groq_error:
        err_msg = f"Groq engine error: {groq_error[:180]}"
    elif not GEMINI_KEY and not GROQ_KEY:
        err_msg = "No API keys configured. Please add GEMINI_API_KEY or GROQ_API_KEY in backend/.env"

    raise RuntimeError(err_msg)

def _call_gemini(file_path: str, filename: str, file_size_str: str, config: AnalysisConfigInput, system_prompt: str) -> AnalysisReport:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_KEY)

    # Upload audio file to Gemini File API
    uploaded_audio = client.files.upload(file=file_path)

    try:
        # Wait for file to become active
        for _ in range(15):
            f_info = client.files.get(name=uploaded_audio.name)
            if f_info.state and f_info.state.name == "ACTIVE":
                break
            time.sleep(1)

        user_prompt = f"""
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

    Return the complete analysis strictly formatted as a valid JSON object matching the AnalysisReport schema:
    {{
      "duration": "01:54",
      "tone": {{
        "rating": "GREEN" or "RED",
        "headline": "Short descriptive title of representative tone",
        "explanation": "Detailed explanation of the representative's demeanor during the call",
        "confidenceScore": 92,
        "sentimentBreakdown": {{
          "repProfessionalism": 88,
          "repEmpathy": 85,
          "repPatience": 90,
          "customerFrustration": 35
        }},
        "evidenceQuotes": [
          {{
            "quote": "Exact transcript quote spoken during call",
            "speaker": "Sales Rep",
            "explanation": "Why this quote justifies the rating",
            "timestamp": "00:30"
          }}
        ]
      }},
      "actionItems": [
        {{
          "id": "act-1",
          "task": "Concrete commitment or item ordered",
          "owner": "Sales Rep" or "Customer" or "Unspecified",
          "deadline": "Spoken deadline or null",
          "evidenceQuote": "Exact sentence spoken in the call",
          "timestamp": "00:05",
          "seconds": 5,
          "confidence": 92
        }}
      ],
      "transcript": [
        {{
          "id": "t-1",
          "speaker": "Sales Rep" or "Customer",
          "isRep": true or false,
          "timestamp": "00:00",
          "seconds": 0,
          "text": "Actual verbatim dialogue spoken",
          "isFlaggedEvidence": false
        }}
      ]
    }}
    """

        # Model priority list (use current production models)
        candidate_models = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.8-flash"]
        last_err = None

        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=[uploaded_audio, user_prompt],
                    config=types.GenerateContentConfig(
                        system_instruction=system_prompt,
                        response_mime_type="application/json",
                        temperature=0.2,
                    ),
                )
                data = json.loads(response.text)
                return _build_report_from_json(data, filename, file_size_str, config)
            except Exception as e:
                print(f"[Info] Gemini model {model_name} failed: {e}. Trying next...")
                last_err = e

        raise last_err or RuntimeError("All Gemini models failed")
    finally:
        # Resource cleanup: guarantee deletion of the uploaded cloud audio file
        try:
            client.files.delete(name=uploaded_audio.name)
            print(f"[Cleanup] Deleted temporary Gemini cloud file: {uploaded_audio.name}")
        except Exception as cleanup_err:
            print(f"[Warning] Gemini cloud file cleanup failed: {cleanup_err}")

def _call_groq(file_path: str, filename: str, file_size_str: str, config: AnalysisConfigInput, system_prompt: str) -> AnalysisReport:
    from groq import Groq
    client = Groq(api_key=GROQ_KEY)

    # 1. Transcribe audio with Whisper on Groq
    with open(file_path, "rb") as file:
        transcription = client.audio.transcriptions.create(
            file=(filename, file.read()),
            model="whisper-large-v3-turbo",
            response_format="verbose_json",
        )

    # 2. Reason over transcript with Qwen 27B / GPT on Groq
    transcript_text = getattr(transcription, "text", str(transcription))
    prompt = f"""
    Evaluate the following call transcript for representative tone and action items.
    Note: The transcript may contain Hindi or Hinglish dialogue.
    Transcript:
    \"\"\"{transcript_text}\"\"\"

    Format strictly as valid JSON adhering to the required schema:
    {{
      "duration": "01:45",
      "tone": {{
        "rating": "GREEN" or "RED",
        "headline": "Short descriptive summary",
        "explanation": "Detailed rationale",
        "confidenceScore": 90,
        "sentimentBreakdown": {{
          "repProfessionalism": 85,
          "repEmpathy": 80,
          "repPatience": 85,
          "customerFrustration": 25
        }},
        "evidenceQuotes": [
          {{
            "quote": "verbatim quote",
            "speaker": "Sales Rep",
            "explanation": "why this quote matters",
            "timestamp": "00:15"
          }}
        ]
      }},
      "actionItems": [
        {{
          "id": "act-1",
          "task": "commitment description",
          "owner": "Sales Rep" or "Customer",
          "deadline": "spoken deadline or null",
          "evidenceQuote": "exact quote",
          "timestamp": "00:10",
          "seconds": 10,
          "confidence": 90
        }}
      ],
      "transcript": [
        {{
          "id": "t-1",
          "speaker": "Sales Rep" or "Customer",
          "isRep": true or false,
          "timestamp": "00:00",
          "seconds": 0,
          "text": "spoken turn text",
          "isFlaggedEvidence": false
        }}
      ]
    }}
    """

    candidate_llms = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"]
    for llm in candidate_llms:
        try:
            chat_completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                model=llm,
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            data = json.loads(chat_completion.choices[0].message.content)
            return _build_report_from_json(data, filename, file_size_str, config)
        except Exception as e:
            print(f"[Info] Groq LLM {llm} failed: {e}. Trying next...")

    raise RuntimeError("All Groq models failed")

def _build_report_from_json(data: dict, filename: str, file_size_str: str, config: AnalysisConfigInput) -> AnalysisReport:
    """
    Safely constructs and sanitizes an AnalysisReport from raw LLM output,
    ensuring defensive clamping on scores, valid defaults, and null-coercion.
    """
    tone_raw = data.get("tone", {})
    breakdown_raw = tone_raw.get("sentimentBreakdown", {}) if isinstance(tone_raw, dict) else {}

    sentiment_breakdown = SentimentBreakdown(
        repProfessionalism=max(0, min(100, int(breakdown_raw.get("repProfessionalism", 85)))),
        repEmpathy=max(0, min(100, int(breakdown_raw.get("repEmpathy", 80)))),
        repPatience=max(0, min(100, int(breakdown_raw.get("repPatience", 85)))),
        customerFrustration=max(0, min(100, int(breakdown_raw.get("customerFrustration", 25)))),
    )

    evidence_quotes = []
    raw_quotes = (
        tone_raw.get("evidenceQuotes")
        or tone_raw.get("evidence_quotes")
        or tone_raw.get("quotes")
        or []
    )
    for eq in raw_quotes:
        if isinstance(eq, dict) and eq.get("quote"):
            evidence_quotes.append(EvidenceQuote(
                quote=str(eq.get("quote", "")).strip(),
                speaker=str(eq.get("speaker", "Sales Rep")).strip(),
                explanation=str(eq.get("explanation", "")).strip(),
                timestamp=str(eq.get("timestamp") or "00:00").strip()
            ))

    tone_result = ToneAnalysisResult(
        rating="RED" if str(tone_raw.get("rating", "")).upper() == "RED" else "GREEN",
        headline=str(tone_raw.get("headline", "Tone Analysis Completed")),
        explanation=str(tone_raw.get("explanation", "")),
        evidenceQuotes=evidence_quotes,
        confidenceScore=max(0, min(100, int(tone_raw.get("confidenceScore", 90)))),
        sentimentBreakdown=sentiment_breakdown
    )

    action_items = []
    raw_items = (
        data.get("actionItems")
        or data.get("action_items")
        or data.get("commitments")
        or []
    )
    for idx, item in enumerate(raw_items):
        if not isinstance(item, dict) or not item.get("task"):
            continue
        raw_dl = item.get("deadline")
        clean_deadline = str(raw_dl).strip() if raw_dl and str(raw_dl).lower() not in ("null", "none", "n/a") else None

        sec = 0
        if isinstance(item.get("seconds"), (int, float)):
            sec = int(item.get("seconds"))

        action_items.append(ActionItem(
            id=str(item.get("id") or f"act-{idx+1}"),
            task=str(item.get("task", "")).strip(),
            owner=str(item.get("owner", "Sales Rep")).strip(),
            deadline=clean_deadline,
            evidenceQuote=str(item.get("evidenceQuote", "")).strip(),
            timestamp=str(item.get("timestamp") or "00:00").strip(),
            seconds=sec,
            confidence=max(0, min(100, int(item.get("confidence", 85))))
        ))

    transcript_segments = []
    raw_segments = (
        data.get("transcript")
        or data.get("transcriptSegments")
        or data.get("segments")
        or data.get("dialogue")
        or []
    )
    for idx, seg in enumerate(raw_segments):
        if not isinstance(seg, dict):
            continue
        speaker_str = str(seg.get("speaker", "Speaker")).strip()
        is_rep_val = seg.get("isRep")
        if is_rep_val is None:
            is_rep_val = ("rep" in speaker_str.lower() or "sales" in speaker_str.lower())
        
        sec = 0
        if isinstance(seg.get("seconds"), (int, float)):
            sec = int(seg.get("seconds"))

        transcript_segments.append(TranscriptSegment(
            id=str(seg.get("id") or f"t-{idx+1}"),
            speaker=speaker_str,
            isRep=bool(is_rep_val),
            timestamp=str(seg.get("timestamp", "00:00")).strip(),
            seconds=sec,
            text=str(seg.get("text", "")).strip(),
            isFlaggedEvidence=bool(seg.get("isFlaggedEvidence", False))
        ))

    return AnalysisReport(
        callId=f"call_{int(time.time())}",
        fileName=filename,
        fileSize=file_size_str,
        duration=str(data.get("duration", "01:54")),
        uploadedAt="Just now",
        status="completed",
        tone=tone_result,
        actionItems=action_items,
        transcript=transcript_segments,
        configUsed=config,
        cached=False,
    )
