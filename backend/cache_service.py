import os
import json
import time
import hashlib
from datetime import timedelta
from typing import Optional, Dict, Any
from sqlalchemy import desc
from database import SessionLocal
from models import CacheEntryModel, utcnow_naive

# Local fallback cache dir (bounded by TTL & max entries)
CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
CACHE_TTL_DAYS = int(os.getenv("CACHE_TTL_DAYS", "7"))
MAX_CACHE_ENTRIES = int(os.getenv("MAX_CACHE_ENTRIES", "5000"))


def compute_audio_hash(audio_bytes: bytes) -> str:
    """Computes a deterministic 24-char SHA-256 fingerprint of raw audio bytes."""
    audio_hasher = hashlib.sha256()
    audio_hasher.update(audio_bytes)
    return audio_hasher.hexdigest()[:24]


def compute_config_hash(config_dict: Dict[str, Any]) -> str:
    """Computes a deterministic 16-char SHA-256 fingerprint of sorted config JSON."""
    config_str = json.dumps(config_dict, sort_keys=True)
    config_hasher = hashlib.sha256()
    config_hasher.update(config_str.encode("utf-8"))
    return config_hasher.hexdigest()[:16]


def compute_cache_key(audio_bytes: bytes, config_dict: Dict[str, Any]) -> str:
    return f"{compute_audio_hash(audio_bytes)}_{compute_config_hash(config_dict)}"


def _scoped_key(org_id: str, raw_key: str) -> str:
    org = org_id or "default-org"
    return f"{org}:{raw_key}"


def _prune_lru_if_needed(db) -> None:
    """Enforces MAX_CACHE_ENTRIES via LRU eviction on oldest last_accessed_at."""
    count = db.query(CacheEntryModel).count()
    if count <= MAX_CACHE_ENTRIES:
        return
    overflow = count - MAX_CACHE_ENTRIES
    oldest = (
        db.query(CacheEntryModel.cache_key)
        .order_by(CacheEntryModel.last_accessed_at.asc())
        .limit(overflow)
        .all()
    )
    keys = [row[0] for row in oldest]
    if keys:
        db.query(CacheEntryModel).filter(CacheEntryModel.cache_key.in_(keys)).delete(synchronize_session=False)


def cleanup_expired_cache() -> int:
    """Purges expired CacheEntryModel rows and stale local cache JSON files."""
    removed = 0
    now = utcnow_naive()
    db = SessionLocal()
    try:
        removed += (
            db.query(CacheEntryModel)
            .filter(CacheEntryModel.expires_at < now)
            .delete(synchronize_session=False)
        )
        _prune_lru_if_needed(db)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Cache Cleanup Warning] {e}")
    finally:
        db.close()

    # Prune legacy/local disk files older than TTL
    cutoff = time.time() - (CACHE_TTL_DAYS * 86400)
    if os.path.isdir(CACHE_DIR):
        for fname in os.listdir(CACHE_DIR):
            fpath = os.path.join(CACHE_DIR, fname)
            try:
                if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                    os.remove(fpath)
                    removed += 1
            except OSError:
                pass
    return removed


def clear_all_cache(org_id: Optional[str] = None) -> int:
    """Clears DB cache entries (scoped to org_id if provided) and local JSON files."""
    cleared = 0
    db = SessionLocal()
    try:
        q = db.query(CacheEntryModel)
        if org_id:
            q = q.filter(CacheEntryModel.org_id == org_id)
        cleared += q.delete(synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Cache Clear Warning] {e}")
    finally:
        db.close()

    if not org_id and os.path.isdir(CACHE_DIR):
        for f in os.listdir(CACHE_DIR):
            if f.endswith(".json"):
                try:
                    os.remove(os.path.join(CACHE_DIR, f))
                    cleared += 1
                except OSError:
                    pass
    return cleared


def _get_db_cache(scoped_key: str) -> Optional[Dict[str, Any]]:
    now = utcnow_naive()
    db = SessionLocal()
    try:
        entry = db.query(CacheEntryModel).filter(CacheEntryModel.cache_key == scoped_key).first()
        if not entry:
            return None
        if entry.expires_at < now:
            db.delete(entry)
            db.commit()
            return None
        entry.last_accessed_at = now
        payload = entry.payload_json
        db.commit()
        return dict(payload) if isinstance(payload, dict) else None
    except Exception as e:
        db.rollback()
        print(f"[Cache Read Warning] {e}")
        return None
    finally:
        db.close()


def _set_db_cache(scoped_key: str, org_id: str, tier: str, payload: Dict[str, Any]) -> None:
    now = utcnow_naive()
    expires = now + timedelta(days=CACHE_TTL_DAYS)
    db = SessionLocal()
    try:
        entry = db.query(CacheEntryModel).filter(CacheEntryModel.cache_key == scoped_key).first()
        if entry:
            entry.payload_json = payload
            entry.expires_at = expires
            entry.last_accessed_at = now
        else:
            db.add(
                CacheEntryModel(
                    cache_key=scoped_key,
                    org_id=org_id or "default-org",
                    tier=tier,
                    payload_json=payload,
                    expires_at=expires,
                    last_accessed_at=now,
                )
            )
        db.flush()
        _prune_lru_if_needed(db)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Cache Write Warning] {e}")
    finally:
        db.close()


def get_audio_base_cache(audio_hash: str, org_id: str = "default-org") -> Optional[Dict[str, Any]]:
    """Retrieves tenant-scoped Tier-1 cached audio transcript & metadata."""
    data = _get_db_cache(_scoped_key(org_id, f"audio_{audio_hash}"))
    if data and data.get("transcript"):
        return data
    return None


def save_audio_base_cache(audio_hash: str, base_dict: Dict[str, Any], org_id: str = "default-org") -> None:
    """Stores tenant-scoped Tier-1 audio base data in shared DB cache with TTL + LRU."""
    _set_db_cache(_scoped_key(org_id, f"audio_{audio_hash}"), org_id, "TIER1_AUDIO", base_dict)


def get_cached_report(cache_key: str, org_id: str = "default-org") -> Optional[Dict[str, Any]]:
    """Retrieves tenant-scoped Tier-2 full analysis report if unexpired."""
    return _get_db_cache(_scoped_key(org_id, cache_key))


def save_cached_report(cache_key: str, report_dict: Dict[str, Any], org_id: str = "default-org") -> None:
    """Stores tenant-scoped Tier-2 analysis report in shared DB cache with TTL + LRU."""
    _set_db_cache(_scoped_key(org_id, cache_key), org_id, "TIER2_REPORT", report_dict)
