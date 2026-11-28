"""
test_db_pool.py - Database connection pool stress and latency test.
Simulates concurrent database sessions to verify connection pool behavior,
concurrency limits, and round-trip query latencies.
"""
import os
import sys
import time
import concurrent.futures
from typing import List, Dict, Any

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from sqlalchemy import text
from database import SessionLocal, DATABASE_URL, engine


def probe_worker(worker_id: int) -> Dict[str, Any]:
    start_time = time.perf_counter()
    status = "SUCCESS"
    error_msg = ""
    db = None
    try:
        db = SessionLocal()
        # Execute basic ping and schema check
        res = db.execute(text("SELECT 1")).scalar()
        if res != 1:
            status = "INVALID_RESULT"
    except Exception as exc:
        status = "FAILED"
        error_msg = str(exc)
    finally:
        if db:
            db.close()

    elapsed_ms = (time.perf_counter() - start_time) * 1000.0
    return {
        "worker_id": worker_id,
        "status": status,
        "elapsed_ms": elapsed_ms,
        "error": error_msg
    }


def run_pool_stress(concurrency: int = 50):
    db_type = "PostgreSQL" if "postgresql" in DATABASE_URL.lower() else "SQLite"
    print(f"=== Database Connection Pool Stress Test ===")
    print(f"Engine Dialect: {db_type}")
    print(f"Pool Configuration: size={getattr(engine.pool, 'size', lambda: 'N/A')()}, max_overflow={getattr(engine.pool, '_max_overflow', 'N/A')}")
    print(f"Executing {concurrency} concurrent connection probes...\n")

    overall_start = time.perf_counter()
    results: List[Dict[str, Any]] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(probe_worker, i) for i in range(concurrency)]
        for fut in concurrent.futures.as_completed(futures):
            results.append(fut.result())

    total_time = (time.perf_counter() - overall_start) * 1000.0
    successes = [r for r in results if r["status"] == "SUCCESS"]
    failures = [r for r in results if r["status"] != "SUCCESS"]
    latencies = [r["elapsed_ms"] for r in successes]

    print(f"--- Results Summary ---")
    print(f"Total Probes:       {len(results)}")
    print(f"Success Count:      {len(successes)} ({len(successes)/len(results)*100:.1f}%)")
    print(f"Failure Count:      {len(failures)}")
    print(f"Wall Clock Time:    {total_time:.2f} ms")

    if latencies:
        latencies.sort()
        avg_lat = sum(latencies) / len(latencies)
        p50 = latencies[int(len(latencies) * 0.50)]
        p95 = latencies[int(len(latencies) * 0.95)]
        p99 = latencies[int(len(latencies) * 0.99)] if len(latencies) > 10 else latencies[-1]
        print(f"Latency Min:        {latencies[0]:.2f} ms")
        print(f"Latency Avg:        {avg_lat:.2f} ms")
        print(f"Latency p50:        {p50:.2f} ms")
        print(f"Latency p95:        {p95:.2f} ms")
        print(f"Latency Max:        {latencies[-1]:.2f} ms")

    if failures:
        print("\nErrors encountered:")
        for f in failures[:5]:
            print(f"  Worker {f['worker_id']}: {f['error']}")


if __name__ == "__main__":
    concurrency_count = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    run_pool_stress(concurrency=concurrency_count)
