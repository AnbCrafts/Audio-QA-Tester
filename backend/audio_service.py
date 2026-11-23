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
    2. MULTILINGUAL ACCURACY: The call may be in Hindi, Hinglish (mixed Hindi-English), English, or regional dialect.
       Preserve the actual spoken dialogue text faithfully (e.g. in Hindi/Hinglish).
    3. ACCURATE TIMESTAMPS: Each transcript segment must include the exact start timestamp ("MM:SS") and integer seconds.
    4. SPEAKER DIARIZATION: Correctly identify the speaker ("Sales Rep" vs "Customer") for each turn.
       Set isFlaggedEvidence=true on any transcript segment where an action item was dictated or where key tone evidence occurred.

    EVALUATION & COMMITMENT REQUIREMENTS:
    1. TONE QUALITY EVALUATION: Evaluate ONLY the Sales Representative's demeanor against the configured rubric.
       Mark RED if negative, rude, hostile, dismissive, or violating criteria; otherwise mark GREEN.
       Support the rating with verbatim evidence quotes and exact timestamps.
    2. GROUNDED ACTION ITEMS:
       Extract all concrete commitments, requested goods/quantities, or next steps dictated during the call.
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

    Format strictly as valid JSON adhering to the required schema with tone, actionItems, and transcript segments.
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
    return AnalysisReport(
        callId=f"call_{int(time.time())}",
        fileName=filename,
        fileSize=file_size_str,
        duration=data.get("duration", "01:54"),
        uploadedAt="Just now",
        status="completed",
        tone=ToneAnalysisResult(**data["tone"]),
        actionItems=[ActionItem(**item) for item in data.get("actionItems", [])],
        transcript=[TranscriptSegment(**seg) for seg in data.get("transcript", [])],
        configUsed=config,
    )
