import time
import threading
from datetime import timedelta
from typing import Callable, Dict, Optional, Tuple, Any
from fastapi import HTTPException, Request, Response
from database import SessionLocal
from models import IdempotencyRecordModel, utcnow_naive


class TokenBucketRateLimiter:
    """
    Thread-safe Token-Bucket Rate Limiter keyed by client IP / org.
    Interface matches Redis Lua Token Bucket for seamless swap later.
    """

    def __init__(self, capacity: int = 20, refill_per_sec: float = 1.0):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self._buckets: Dict[str, Tuple[float, float]] = {}
        self._lock = threading.Lock()

    def allow(self, key: str, cost: float = 1.0) -> Tuple[bool, int, int]:
        now = time.monotonic()
        with self._lock:
            tokens, last_ts = self._buckets.get(key, (float(self.capacity), now))
            elapsed = max(0.0, now - last_ts)
            tokens = min(float(self.capacity), tokens + elapsed * self.refill_per_sec)

            if tokens < cost:
                self._buckets[key] = (tokens, now)
                wait_sec = max(1, int((cost - tokens) / self.refill_per_sec) + 1)
                return False, int(tokens), wait_sec

            tokens -= cost
            self._buckets[key] = (tokens, now)
            return True, int(tokens), 0

    def reset(self) -> None:
        with self._lock:
            self._buckets.clear()


analysis_rate_limiter = TokenBucketRateLimiter(capacity=15, refill_per_sec=0.5)
auth_rate_limiter = TokenBucketRateLimiter(capacity=10, refill_per_sec=0.2)


def enforce_rate_limit(limiter: TokenBucketRateLimiter, identity: str, response: Optional[Response] = None) -> None:
    allowed, remaining, retry_after = limiter.allow(identity)
    if response is not None:
        response.headers["X-RateLimit-Remaining"] = str(remaining)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"Too many requests. Please retry after {retry_after} seconds.",
            headers={"Retry-After": str(retry_after), "X-RateLimit-Remaining": "0"},
        )


def rate_limit_analysis(request: Request, response: Response) -> None:
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit(analysis_rate_limiter, f"analysis:{client_ip}", response)


def rate_limit_auth(request: Request, response: Response) -> None:
    client_ip = request.client.host if request.client else "unknown"
    enforce_rate_limit(auth_rate_limiter, f"auth:{client_ip}", response)


class SingleFlightCache:
    """
    Prevents cache stampedes (e.g. 500 users refreshing Analytics at 9:00 AM):
    only 1 caller computes the snapshot while concurrent callers wait or read cached copy.
    """

    def __init__(self, ttl_seconds: int = 30):
        self.ttl_seconds = ttl_seconds
        self._store: Dict[str, Tuple[float, Any]] = {}
        self._key_locks: Dict[str, threading.Lock] = {}
        self._global_lock = threading.Lock()

    def _get_lock(self, key: str) -> threading.Lock:
        with self._global_lock:
            if key not in self._key_locks:
                self._key_locks[key] = threading.Lock()
            return self._key_locks[key]

    def get_or_compute(self, key: str, compute_fn: Callable[[], Any]) -> Any:
        now = time.monotonic()
        cached = self._store.get(key)
        if cached and cached[0] > now:
            return cached[1]

        lock = self._get_lock(key)
        with lock:
            now = time.monotonic()
            cached = self._store.get(key)
            if cached and cached[0] > now:
                return cached[1]
            value = compute_fn()
            self._store[key] = (time.monotonic() + self.ttl_seconds, value)
            return value

    def invalidate(self, key: str) -> None:
        with self._global_lock:
            self._store.pop(key, None)


analytics_single_flight = SingleFlightCache(ttl_seconds=30)


def reserve_idempotency(org_id: str, method: str, path: str, idem_key: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Checks or reserves an Idempotency-Key in Neon DB.
    - Returns cached response dict if already COMPLETED.
    - Raises 409 Conflict if currently IN_PROGRESS.
    - Returns None if freshly reserved and caller should proceed.
    """
    if not idem_key or not idem_key.strip():
        return None

    record_id = f"{org_id}:{method.upper()}:{path}:{idem_key.strip()[:120]}"
    now = utcnow_naive()
    db = SessionLocal()
    try:
        # Clean expired record if any
        existing = db.query(IdempotencyRecordModel).filter(IdempotencyRecordModel.id == record_id).first()
        if existing:
            if existing.expires_at < now:
                db.delete(existing)
                db.commit()
            elif existing.status == "COMPLETED" and existing.response_json is not None:
                return existing.response_json
            else:
                raise HTTPException(status_code=409, detail="Duplicate request currently in flight.")

        db.add(
            IdempotencyRecordModel(
                id=record_id,
                org_id=org_id,
                status="IN_PROGRESS",
                http_status=202,
                expires_at=now + timedelta(hours=24),
            )
        )
        db.commit()
        return None
    except HTTPException:
        raise
    except Exception:
        db.rollback()
        # Race on concurrent insert -> treat as duplicate in-flight
        raise HTTPException(status_code=409, detail="Duplicate request already being processed.")
    finally:
        db.close()


def complete_idempotency(org_id: str, method: str, path: str, idem_key: Optional[str], response_body: Dict[str, Any], http_status: int = 202) -> None:
    if not idem_key or not idem_key.strip():
        return
    record_id = f"{org_id}:{method.upper()}:{path}:{idem_key.strip()[:120]}"
    db = SessionLocal()
    try:
        rec = db.query(IdempotencyRecordModel).filter(IdempotencyRecordModel.id == record_id).first()
        if rec:
            rec.status = "COMPLETED"
            rec.http_status = http_status
            rec.response_json = response_body
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def release_idempotency(org_id: str, method: str, path: str, idem_key: Optional[str]) -> None:
    if not idem_key or not idem_key.strip():
        return
    record_id = f"{org_id}:{method.upper()}:{path}:{idem_key.strip()[:120]}"
    db = SessionLocal()
    try:
        db.query(IdempotencyRecordModel).filter(IdempotencyRecordModel.id == record_id).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
