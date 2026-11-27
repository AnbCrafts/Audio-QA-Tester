"""
Manual CLI Golden Evaluation Runner for the QA Audio Auditor AI pipeline.
Not imported or executed by pytest to avoid live LLM costs during unit/integration tests.

Usage:
    python eval_golden.py
    python eval_golden.py --dry-run
"""

import argparse
import os
import sys
import time
from dataclasses import dataclass
from typing import List, Optional
from dotenv import load_dotenv

load_dotenv()

from schemas import AnalysisConfigInput
from audio_service import analyze_call_with_ai


@dataclass
class GoldenCase:
    name: str
    filename: str
    expected_tones: tuple[str, ...]
    min_turns: int = 2
    require_commitments: bool = False


GOLDEN_CASES: List[GoldenCase] = [
    GoldenCase(
        name="Green Standard Call",
        filename="test_call_green.m4a",
        expected_tones=("GREEN",),
        min_turns=2,
    ),
    GoldenCase(
        name="Red Flag Escalation Call",
        filename="test_call_red.m4a",
        expected_tones=("RED",),
        min_turns=2,
    ),
    GoldenCase(
        name="Multilingual Support Call",
        filename="test_call_multilingual.m4a",
        expected_tones=("GREEN", "RED"),
        min_turns=2,
    ),
]


def resolve_fixture_path(filename: str) -> Optional[str]:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(base_dir, ".."))
    candidates = [
        os.path.join(base_dir, "sample_audio", filename),
        os.path.join(repo_root, "frontend", "public", filename),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Run golden benchmark suite on sample audio fixtures.")
    parser.add_argument("--dry-run", action="store_true", help="Verify fixtures without invoking live AI models.")
    args = parser.parse_args()

    config = AnalysisConfigInput(
        presetId="saas_sales",
        presetName="Golden Benchmark",
        sensitivity="balanced",
        toneCriteria="Patient, polite, clearly structured responses and empathetic handling.",
        actionItemScope="explicit_commitments",
    )

    print("=" * 72)
    print("AUDIO QA GOLDEN EVALUATION SUITE")
    print("=" * 72)

    passed = 0
    failed = 0

    for case in GOLDEN_CASES:
        path = resolve_fixture_path(case.filename)
        if not path:
            print(f"[FAIL] {case.name}: fixture '{case.filename}' not found.")
            failed += 1
            continue

        size_mb = f"{os.path.getsize(path) / (1024 * 1024):.2f} MB"
        if args.dry_run:
            print(f"[DRY-RUN PASS] {case.name}: found {path} ({size_mb})")
            passed += 1
            continue

        start = time.perf_counter()
        try:
            report = analyze_call_with_ai(
                file_path=path,
                filename=case.filename,
                file_size_str=size_mb,
                config=config,
                org_id="eval-golden",
            )
            elapsed = time.perf_counter() - start
            tone_ok = report.tone.rating in case.expected_tones
            turns_ok = len(report.transcript) >= case.min_turns
            comm_ok = (not case.require_commitments) or (len(report.actionItems) > 0)

            if tone_ok and turns_ok and comm_ok:
                print(
                    f"[PASS] {case.name} ({elapsed:.2f}s) | "
                    f"Tone={report.tone.rating} Score={report.overallScore} "
                    f"Turns={len(report.transcript)} Commitments={len(report.actionItems)}"
                )
                passed += 1
            else:
                print(
                    f"[FAIL] {case.name} ({elapsed:.2f}s) | "
                    f"Got Tone={report.tone.rating} (expected {case.expected_tones}), "
                    f"Turns={len(report.transcript)} (min {case.min_turns})"
                )
                failed += 1
        except Exception as exc:
            elapsed = time.perf_counter() - start
            print(f"[ERROR] {case.name} ({elapsed:.2f}s): {exc}")
            failed += 1

    print("-" * 72)
    print(f"Summary: {passed} passed, {failed} failed out of {len(GOLDEN_CASES)} cases.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
