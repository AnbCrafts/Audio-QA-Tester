import os
import json
import hashlib
from typing import Optional, Dict, Any

# Local cache directory inside backend/cache
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")

def compute_cache_key(audio_bytes: bytes, config_dict: Dict[str, Any]) -> str:
    """
    Computes a deterministic content-addressed hash from:
    1. The raw audio file bytes (SHA-256)
    2. The analysis configuration parameters (sorted JSON SHA-256)
    
    If both the audio content and the configuration match a previous run,
    the cache key will be identical.
    """
    audio_hasher = hashlib.sha256()
    audio_hasher.update(audio_bytes)
    audio_hash = audio_hasher.hexdigest()[:24]

    # Normalize config dictionary to canonical sorted JSON string
    config_str = json.dumps(config_dict, sort_keys=True)
    config_hasher = hashlib.sha256()
    config_hasher.update(config_str.encode("utf-8"))
    config_hash = config_hasher.hexdigest()[:16]

    return f"{audio_hash}_{config_hash}"

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
        print(f"[Cache Saved] Stored analysis report under cache key: {cache_key}")
    except Exception as e:
        print(f"[Cache Warning] Failed to save report {cache_key}: {e}")
