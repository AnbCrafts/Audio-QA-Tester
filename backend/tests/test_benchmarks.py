import hashlib
import os
import sys
import pytest

# Ensure backend root is on Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from cache_service import compute_config_hash
from auth_service import create_signed_token, decode_signed_token
from storage_service import sanitize_filename


def test_benchmark_compute_config_hash(benchmark):
    """Measures speed of configuration hash computation used for caching."""
    config = {
        "model": "gemini-2.5-flash",
        "demeanor_weight": 0.4,
        "policy_weight": 0.3,
        "commitments_weight": 0.3,
        "red_flag_threshold": 60,
        "custom_rules": ["Identify active listening", "Flag abusive interruptions"]
    }
    result = benchmark(compute_config_hash, config)
    assert isinstance(result, str)
    assert len(result) == 16


def test_benchmark_sha256_audio_chunk(benchmark):
    """Measures SHA-256 calculation speed across a typical 2MB audio chunk."""
    chunk_bytes = os.urandom(2 * 1024 * 1024)

    def _hash_chunk():
        hasher = hashlib.sha256()
        hasher.update(chunk_bytes)
        return hasher.hexdigest()

    result = benchmark(_hash_chunk)
    assert len(result) == 64


def test_benchmark_jwt_token_cycle(benchmark):
    """Measures JWT generation and validation speed per request."""
    payload = {
        "userId": "user-perf-test",
        "email": "tester@inflect.ai",
        "fullName": "Performance Tester",
        "orgId": "org-perf-123",
        "orgName": "Inflect Test Org",
        "role": "ADMIN"
    }

    def _jwt_cycle():
        token = create_signed_token(payload, expires_in_seconds=3600)
        decoded = decode_signed_token(token)
        return decoded

    result = benchmark(_jwt_cycle)
    assert result["userId"] == "user-perf-test"


def test_benchmark_sanitize_filename(benchmark):
    """Measures filename sanitization throughput under burst uploads."""
    raw_name = "Customer_Call-2026-11-28_Agent-999 (Sales Escalation) [Final].wav"
    result = benchmark(sanitize_filename, raw_name)
    assert "Customer" in result
