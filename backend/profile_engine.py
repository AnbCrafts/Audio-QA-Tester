"""
profile_engine.py - Profiles the critical backend pipeline paths using cProfile.
Outputs 'profile.prof' for interactive visualization via 'snakeviz profile.prof'.
"""
import cProfile
import pstats
import io
import os
import sys
import hashlib
import json

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from cache_service import compute_config_hash
from storage_service import sanitize_filename, validate_audio_magic_bytes
from auth_service import create_signed_token, decode_signed_token


def run_pipeline_workload(iterations: int = 500):
    """Executes representative CPU-bound logic in the analysis pipeline."""
    sample_rubric = {
        "demeanor_weight": 0.4,
        "policy_weight": 0.3,
        "commitments_weight": 0.3,
        "red_flag_threshold": 60,
        "custom_rules": [
            "Customer sentiment drop detection",
            "Agent empathy acknowledgement",
            "Commitment promise isolation with explicit deadline"
        ]
    }
    sample_bytes = os.urandom(512 * 1024)  # 512 KB simulate chunk

    for i in range(iterations):
        # 1. Config hashing
        cfg_hash = compute_config_hash(sample_rubric)

        # 2. SHA-256 chunk digest
        hasher = hashlib.sha256()
        hasher.update(sample_bytes)
        digest = hasher.hexdigest()

        # 3. Filename sanitation
        clean_name = sanitize_filename(f"Customer_Escalation_{i}_{digest[:8]}.wav")

        # 4. Token generation & verification cycle
        tok = create_signed_token({"user": f"worker_{i}", "orgId": "default-org"})
        payload = decode_signed_token(tok)


def main():
    print(f"[*] Starting cProfile on pipeline execution workload (500 iterations)...")
    profiler = cProfile.Profile()
    profiler.enable()

    run_pipeline_workload(iterations=500)

    profiler.disable()
    output_prof = os.path.join(backend_dir, "profile.prof")
    profiler.dump_stats(output_prof)
    print(f"[+] Profiling data successfully written to: {output_prof}")

    # Print top 15 functions by cumulative time
    s = io.StringIO()
    ps = pstats.Stats(profiler, stream=s).sort_stats("cumulative")
    ps.print_stats(15)
    print("\n--- TOP 15 EXECUTION PATHS (by Cumulative Time) ---")
    print(s.getvalue())
    print("\nTo view the interactive flamegraph / call tree in your browser, run:")
    print(f"  snakeviz \"{output_prof}\"")


if __name__ == "__main__":
    main()
