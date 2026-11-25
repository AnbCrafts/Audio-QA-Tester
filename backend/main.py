import os
import json
import shutil
import tempfile
import asyncio
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from schemas import AnalysisConfigInput, AnalysisReport
from audio_service import analyze_call_with_ai, reanalyze_from_transcript
from cache_service import (
    compute_audio_hash,
    compute_config_hash,
    compute_cache_key,
    get_cached_report,
    save_cached_report,
    get_audio_base_cache,
    save_audio_base_cache,
)

app = FastAPI(
    title="ScaleWorks AI - Sales Call Quality Analysis Agent",
    description="Backend API for .m4a sales call transcription, tone evaluation, and action item extraction.",
    version="1.0.0"
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    return {
        "status": "healthy",
        "service": "Sales Call Quality Analysis Agent",
        "gemini_configured": bool(gemini_key),
        "groq_configured": bool(groq_key)
    }

@app.delete("/api/cache")
def clear_cache():
    from cache_service import CACHE_DIR
    cleared_count = 0
    if os.path.exists(CACHE_DIR):
        for f in os.listdir(CACHE_DIR):
            if f.endswith(".json"):
                try:
                    os.remove(os.path.join(CACHE_DIR, f))
                    cleared_count += 1
                except OSError:
                    pass
    return {"status": "cache_cleared", "deleted_files": cleared_count}

@app.post("/api/analyze", response_model=AnalysisReport)
async def analyze_call(
    file: UploadFile = File(...),
    config: str = Form(...)
):
    # Validate file type (.m4a preferred)
    filename = file.filename or "recording.m4a"
    valid_exts = (".m4a", ".mp3", ".wav", ".ogg", ".aac")
    if not any(filename.lower().endswith(ext) for ext in valid_exts):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format. Please upload an .m4a audio file."
        )

    # Parse config JSON
    try:
        config_dict = json.loads(config)
        parsed_config = AnalysisConfigInput(**config_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid configuration parameters: {e}")

    # Read uploaded file content into memory for caching and temporary persistence
    content = await file.read()
    file_size_mb = f"{len(content) / (1024 * 1024):.2f} MB"

    audio_hash = compute_audio_hash(content)
    config_hash = compute_config_hash(config_dict)
    cache_key = f"{audio_hash}_{config_hash}"

    # =========================================================================
    # Tier 2 Cache Check: Full report match (Instant 0ms retrieval)
    # =========================================================================
    cached_data = get_cached_report(cache_key)
    if cached_data and cached_data.get("transcript") and len(cached_data["transcript"]) > 0:
        print(f"[Tier-2 Cache Hit] Returning full cached analysis in 0ms for key: {cache_key}")
        cached_data["cached"] = True
        return AnalysisReport(**cached_data)

    # =========================================================================
    # Tier 1 Cache Check: Audio base transcript exists! (~300ms fast re-eval)
    # Bypasses 25MB audio re-uploading and heavy audio token spend completely.
    # =========================================================================
    audio_base = get_audio_base_cache(audio_hash)
    if audio_base and audio_base.get("transcript") and len(audio_base["transcript"]) > 0:
        print(f"[Tier-1 Audio Cache Hit] Found existing verified transcript for audio_{audio_hash}!")
        print(f"[Tier-1 Fast Reasoning] Re-evaluating tone against new config in ~300ms...")
        try:
            fast_report = await asyncio.to_thread(
                reanalyze_from_transcript,
                audio_base=audio_base,
                filename=filename,
                file_size_str=file_size_mb,
                config=parsed_config
            )
            # Store in Tier-2 cache for instant 0ms hits on this specific config
            if fast_report.transcript and len(fast_report.transcript) > 0:
                save_cached_report(cache_key, fast_report.model_dump())
            return fast_report
        except Exception as tier1_err:
            print(f"[Tier-1 Fallback] Fast re-eval hit issue ({tier1_err}), falling back to full audio pipeline...")

    # =========================================================================
    # Tier 1 Miss (Cold Run): Full Multimodal Audio Processing (~3.5s)
    # =========================================================================
    suffix = os.path.splitext(filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_path = tmp_file.name
        tmp_file.write(content)

    try:
        report = await asyncio.to_thread(
            analyze_call_with_ai,
            file_path=tmp_path,
            filename=filename,
            file_size_str=file_size_mb,
            config=parsed_config
        )
        if report.transcript and len(report.transcript) > 0:
            # 1. Save to Tier 1 Audio Base Cache (Transcript, Duration, Metadata)
            save_audio_base_cache(audio_hash, {
                "transcript": [seg.model_dump() for seg in report.transcript],
                "duration": report.duration,
                "callMetadata": report.callMetadata.model_dump() if report.callMetadata else None
            })
            # 2. Save to Tier 2 Config Cache
            save_cached_report(cache_key, report.model_dump())
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {str(e)}")
    finally:
        # Safe cleanup of temp audio file
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
