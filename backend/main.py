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
from audio_service import analyze_call_with_ai
from cache_service import compute_cache_key, get_cached_report, save_cached_report

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

    # Check for response cache hit (Instant 0ms retrieval)
    cache_key = compute_cache_key(content, config_dict)
    cached_data = get_cached_report(cache_key)
    if cached_data and cached_data.get("transcript") and len(cached_data["transcript"]) > 0:
        print(f"[Cache Hit] Returning cached analysis for key: {cache_key}")
        cached_data["cached"] = True
        return AnalysisReport(**cached_data)

    # Cache miss: Save uploaded file temporarily for AI processing
    suffix = os.path.splitext(filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
        tmp_path = tmp_file.name
        tmp_file.write(content)

    try:
        # Run AI Analysis Pipeline in thread pool to prevent blocking the asyncio event loop
        report = await asyncio.to_thread(
            analyze_call_with_ai,
            file_path=tmp_path,
            filename=filename,
            file_size_str=file_size_mb,
            config=parsed_config
        )
        # Store successful result in cache ONLY if it produced a real transcript
        if report.transcript and len(report.transcript) > 0:
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
