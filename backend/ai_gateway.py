import os
import time
import random
import threading
from datetime import datetime, timedelta, timezone
from typing import Callable, Dict, Optional, TypeVar, Any, List
from sqlalchemy import func
from database import SessionLocal
from models import OrganizationModel, TokenUsageLedgerModel, utcnow_naive

T = TypeVar("T")

# Approximate USD pricing per 1M tokens for telemetry
MODEL_PRICING_PER_1M: Dict[str, Dict[str, float]] = {
    "gemini-3.5-flash": {"input": 0.15, "output": 0.60, "cached": 0.0375},
    "gemini-3.5-flash-lite": {"input": 0.075, "output": 0.30, "cached": 0.01875},
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60, "cached": 0.0375},
    "gemini-2.5-flash-lite": {"input": 0.075, "output": 0.30, "cached": 0.01875},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.00, "cached": 0.3125},
    "gemini-flash-latest": {"input": 0.15, "output": 0.60, "cached": 0.0375},
    "gemini-flash-lite-latest": {"input": 0.075, "output": 0.30, "cached": 0.01875},
    "qwen/qwen3.8-27b": {"input": 0.20, "output": 0.40, "cached": 0.20},
    "openai/gpt-oss-120b": {"input": 0.30, "output": 0.60, "cached": 0.30},
    "openai/gpt-oss-20b": {"input": 0.10, "output": 0.20, "cached": 0.10},
    "whisper-large-v3-turbo": {"input": 0.04, "output": 0.0, "cached": 0.04},
}


class CircuitOpenError(RuntimeError):
    """Raised immediately when a provider circuit breaker is OPEN."""


class DailyQuotaExceededError(RuntimeError):
    """Raised when an organization exhausts its daily token budget."""

    def __init__(
        self,
        message: str,
        used_today: int,
        daily_limit: int,
        renews_at_utc: str,
        retry_after_seconds: int,
    ):
        super().__init__(message)
        self.used_today = used_today
        self.daily_limit = daily_limit
        self.renews_at_utc = renews_at_utc
        self.retry_after_seconds = retry_after_seconds


def is_retryable_ai_error(exc: Exception) -> bool:
    """Distinguishes transient 429/5xx/timeout errors from permanent 400/401/403/quota errors."""
    if isinstance(exc, (CircuitOpenError, DailyQuotaExceededError, ValueError)):
        return False
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if isinstance(status, int):
        if status in (400, 401, 403, 404, 422):
            return False
        if status in (408, 429, 500, 502, 503, 504):
            return True

    msg = str(exc).lower()
    non_retry_markers = (
        "api key not valid",
        "invalid api key",
        "permission denied",
        "unauthorized",
        "401",
        "403",
        "invalid argument",
        "context length",
    )
    if any(m in msg for m in non_retry_markers):
        return False
    return True


def execute_with_retry_jitter(
    fn: Callable[[], T],
    max_attempts: int = 3,
    base_delay: float = 0.8,
    cap_delay: float = 8.0,
) -> T:
    """Executes an AI provider call with exponential backoff + full jitter on transient failures."""
    last_err: Optional[Exception] = None
    for attempt in range(max_attempts):
        try:
            return fn()
        except Exception as exc:
            last_err = exc
            if not is_retryable_ai_error(exc) or attempt == max_attempts - 1:
                raise
            exp = min(cap_delay, base_delay * (2 ** attempt))
            sleep_sec = random.uniform(0.1, exp)
            time.sleep(sleep_sec)
    raise last_err or RuntimeError("AI call failed after retries")


class CircuitBreaker:
    """Thread-safe per-provider circuit breaker preventing repeated waits on dead endpoints."""

    def __init__(self, provider: str, failure_threshold: int = 5, window_sec: int = 30, cooldown_sec: int = 60):
        self.provider = provider
        self.failure_threshold = failure_threshold
        self.window_sec = window_sec
        self.cooldown_sec = cooldown_sec
        self._failures: List[float] = []
        self._opened_until: float = 0.0
        self._lock = threading.Lock()

    def state(self) -> str:
        now = time.monotonic()
        with self._lock:
            if self._opened_until > now:
                return "OPEN"
            return "CLOSED"

    def call(self, fn: Callable[[], T]) -> T:
        now = time.monotonic()
        with self._lock:
            if self._opened_until > now:
                remaining = int(self._opened_until - now) + 1
                raise CircuitOpenError(f"{self.provider} circuit breaker is OPEN (cooldown {remaining}s)")

        try:
            res = fn()
            with self._lock:
                self._failures.clear()
                self._opened_until = 0.0
            return res
        except Exception as exc:
            if is_retryable_ai_error(exc):
                with self._lock:
                    cur = time.monotonic()
                    self._failures = [t for t in self._failures if cur - t <= self.window_sec]
                    self._failures.append(cur)
                    if len(self._failures) >= self.failure_threshold:
                        self._opened_until = cur + self.cooldown_sec
            raise

    def reset(self) -> None:
        with self._lock:
            self._failures.clear()
            self._opened_until = 0.0


gemini_circuit = CircuitBreaker("gemini", failure_threshold=5, window_sec=30, cooldown_sec=60)
groq_circuit = CircuitBreaker("groq", failure_threshold=5, window_sec=30, cooldown_sec=60)


def estimate_audio_tokens(duration_sec: float) -> int:
    return max(100, int(round(max(1.0, duration_sec) * 35)))


def estimate_text_tokens(text: str) -> int:
    return max(50, len(text or "") // 3)


def _utc_day_bounds() -> tuple[datetime, datetime, int]:
    now_utc = datetime.now(timezone.utc)
    today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow_start = today_start + timedelta(days=1)
    retry_after = max(1, int((tomorrow_start - now_utc).total_seconds()))
    return (
        today_start.replace(tzinfo=None),
        tomorrow_start.replace(tzinfo=None),
        retry_after,
    )


def get_org_daily_token_status(db, org_id: str) -> Dict[str, Any]:
    """Computes today's UTC token consumption, daily limit, remaining balance, and renewal time."""
    org = db.query(OrganizationModel).filter(OrganizationModel.id == org_id).first()
    default_limit = int(os.getenv("DEFAULT_ORG_DAILY_TOKEN_LIMIT", "500000"))
    org_name = org.name if org else "Default Workspace"
    daily_limit = org.daily_token_limit if org else default_limit

    today_start, tomorrow_start, retry_after = _utc_day_bounds()

    used_today = int(
        db.query(func.coalesce(func.sum(TokenUsageLedgerModel.total_tokens), 0))
        .filter(
            TokenUsageLedgerModel.org_id == org_id,
            TokenUsageLedgerModel.created_at >= today_start,
        )
        .scalar()
        or 0
    )

    all_time_row = (
        db.query(
            func.coalesce(func.sum(TokenUsageLedgerModel.total_tokens), 0),
            func.coalesce(func.sum(TokenUsageLedgerModel.estimated_cost_usd), 0.0),
        )
        .filter(TokenUsageLedgerModel.org_id == org_id)
        .first()
    )
    total_all_time = int(all_time_row[0] or 0) if all_time_row else 0
    total_cost_all_time = round(float(all_time_row[1] or 0.0), 6) if all_time_row else 0.0

    by_model_rows = (
        db.query(
            TokenUsageLedgerModel.model,
            TokenUsageLedgerModel.provider,
            func.count(TokenUsageLedgerModel.id),
            func.coalesce(func.sum(TokenUsageLedgerModel.total_tokens), 0),
            func.coalesce(func.sum(TokenUsageLedgerModel.estimated_cost_usd), 0.0),
        )
        .filter(TokenUsageLedgerModel.org_id == org_id)
        .group_by(TokenUsageLedgerModel.model, TokenUsageLedgerModel.provider)
        .all()
    )

    by_model = [
        {
            "model": row[0],
            "provider": row[1],
            "requests": int(row[2] or 0),
            "totalTokens": int(row[3] or 0),
            "costUsd": round(float(row[4] or 0.0), 6),
        }
        for row in by_model_rows
    ]

    remaining = max(0, daily_limit - used_today)
    usage_pct = round(min(100.0, (used_today / daily_limit) * 100.0), 1) if daily_limit > 0 else 0.0
    is_exhausted = daily_limit > 0 and used_today >= daily_limit

    return {
        "orgId": org_id,
        "orgName": org_name,
        "usedToday": used_today,
        "dailyLimit": daily_limit,
        "remainingToday": remaining,
        "usagePct": usage_pct,
        "isExhausted": is_exhausted,
        "renewsAtUtc": tomorrow_start.replace(tzinfo=timezone.utc).isoformat(),
        "retryAfterSeconds": retry_after,
        "totalTokensAllTime": total_all_time,
        "totalCostUsdAllTime": total_cost_all_time,
        "byModel": by_model,
    }


def assert_org_daily_quota(db, org_id: str, estimated_tokens: int = 0) -> Dict[str, Any]:
    """
    Blocks new AI requests if the tenant exhausted its daily token quota.
    Automatically renews at 00:00 UTC the next day.
    """
    status = get_org_daily_token_status(db, org_id)
    if status["isExhausted"] or (estimated_tokens > 0 and status["remainingToday"] <= 0):
        raise DailyQuotaExceededError(
            message=(
                f"Daily token quota exhausted ({status['usedToday']:,} / {status['dailyLimit']:,} tokens used). "
                f"Quota renews automatically at {status['renewsAtUtc']}."
            ),
            used_today=status["usedToday"],
            daily_limit=status["dailyLimit"],
            renews_at_utc=status["renewsAtUtc"],
            retry_after_seconds=status["retryAfterSeconds"],
        )
    return status


def record_token_usage(
    *,
    org_id: str,
    provider: str,
    model: str,
    stage: str,
    input_tokens: int,
    output_tokens: int,
    cached_tokens: int = 0,
    job_id: Optional[str] = None,
    call_id: Optional[str] = None,
) -> None:
    """Persists provider token usage & estimated USD cost into TokenUsageLedgerModel."""
    in_tok = max(0, int(input_tokens or 0))
    out_tok = max(0, int(output_tokens or 0))
    cached_tok = max(0, int(cached_tokens or 0))
    total_tok = in_tok + out_tok

    pricing = MODEL_PRICING_PER_1M.get(model, {"input": 0.25, "output": 0.60, "cached": 0.10})
    uncached_in = max(0, in_tok - cached_tok)
    cost_usd = (
        (uncached_in / 1_000_000.0) * pricing["input"]
        + (cached_tok / 1_000_000.0) * pricing.get("cached", pricing["input"])
        + (out_tok / 1_000_000.0) * pricing["output"]
    )

    db = SessionLocal()
    try:
        db.add(
            TokenUsageLedgerModel(
                org_id=org_id or "default-org",
                job_id=job_id,
                call_id=call_id,
                provider=provider,
                model=model,
                stage=stage,
                input_tokens=in_tok,
                output_tokens=out_tok,
                cached_tokens=cached_tok,
                total_tokens=total_tok,
                estimated_cost_usd=round(cost_usd, 6),
                created_at=utcnow_naive(),
            )
        )
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Token Ledger Warning] Failed to record token usage: {e}")
    finally:
        db.close()
