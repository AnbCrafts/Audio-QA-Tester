import os
import json
import hashlib
from typing import Optional, Dict, Any

# Local cache directory inside backend/cache
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")

def compute_audio_hash(audio_bytes: bytes) -> str:
    """
    Computes a deterministic SHA-256 fingerprint of the raw audio bytes (24 chars).
    Used as the key for Tier-1 Audio Base Caching (transcripts, diarization, audio metadata).
    """
    audio_hasher = hashlib.sha256()
    audio_hasher.update(audio_bytes)
    return audio_hasher.hexdigest()[:24]

def compute_config_hash(config_dict: Dict[str, Any]) -> str:
    """
    Computes a deterministic SHA-256 fingerprint of the sorted JSON configuration (16 chars).
    """
    config_str = json.dumps(config_dict, sort_keys=True)
    config_hasher = hashlib.sha256()
    config_hasher.update(config_str.encode("utf-8"))
    return config_hasher.hexdigest()[:16]

def compute_cache_key(audio_bytes: bytes, config_dict: Dict[str, Any]) -> str:
    """
    Tier-2 Composite Cache Key: f"{audio_hash}_{config_hash}"
    If both the audio content and the configuration match a previous run,
    the cache key will be identical (0ms instant return).
    """
    audio_hash = compute_audio_hash(audio_bytes)
    config_hash = compute_config_hash(config_dict)
    return f"{audio_hash}_{config_hash}"

# =========================================================================
# Tier 1: Audio Base Cache (Transcript, Diarization, Durations, Metadata)
# Keyed by audio_hash only. Bypasses 25MB audio re-uploading and audio tokens.
# =========================================================================

def get_audio_base_cache(audio_hash: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves Tier-1 cached audio base data (transcription, speaker turns, metadata).
    Returns None if cache misses.
    """
    cache_path = os.path.join(CACHE_DIR, f"audio_{audio_hash}.json")
    if not os.path.isfile(cache_path):
        return None

    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if data and data.get("transcript") and len(data["transcript"]) > 0:
                return data
            return None
    except Exception as e:
        print(f"[Cache Warning] Failed to read audio base cache {audio_hash}: {e}")
        return None

def save_audio_base_cache(audio_hash: str, base_dict: Dict[str, Any]) -> None:
    """
    Saves Tier-1 audio base data (transcript and metadata) to disk for fast re-evaluation.
    """
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_path = os.path.join(CACHE_DIR, f"audio_{audio_hash}.json")
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(base_dict, f, indent=2, ensure_ascii=False)
        print(f"[Tier-1 Cache Saved] Stored audio base transcript under: audio_{audio_hash}.json")
    except Exception as e:
        print(f"[Cache Warning] Failed to save audio base cache {audio_hash}: {e}")

# =========================================================================
# Tier 2: Full Analysis Report Cache (Evaluation, Verdict, Scores, Actions)
# Keyed by composite f"{audio_hash}_{config_hash}".
# =========================================================================

def get_cached_report(cache_key: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves a cached analysis report if it exists on disk.
    Returns None if cache misses or if parsing fails.
    """
    cache_path = os.path.join(CACHE_DIR, f"{cache_key}.json")
    if not os.path.isfile(cache_path):
        return None

    try:
        with open(cache_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data
    except Exception as e:
        print(f"[Cache Warning] Failed to read cached report {cache_key}: {e}")
        return None

def save_cached_report(cache_key: str, report_dict: Dict[str, Any]) -> None:
    """
    Saves the generated report to disk for instant future retrieval.
    """
    try:
        os.makedirs(CACHE_DIR, exist_ok=True)
        cache_path = os.path.join(CACHE_DIR, f"{cache_key}.json")
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(report_dict, f, indent=2, ensure_ascii=False)
        print(f"[Tier-2 Cache Saved] Stored analysis report under cache key: {cache_key}")
    except Exception as e:
        print(f"[Cache Warning] Failed to save report {cache_key}: {e}")
