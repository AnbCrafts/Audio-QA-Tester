import os
import uuid
import shutil
import hashlib
import tempfile
import subprocess
from fastapi.testclient import TestClient

from storage_service import validate_audio_magic_bytes, storage_provider
from audio_chunker import (
    get_ffmpeg_bin,
    probe_audio_duration,
    plan_split_windows,
    extract_audio_chunk,
    format_timestamp,
)
from audio_service import (
    merge_chunk_transcripts,
    _enforce_forbidden_phrases_guard,
)
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    ToneAnalysisResult,
    SentimentBreakdown,
    TranscriptSegment,
)
import main
from database import SessionLocal
from models import AudioAssetModel, UploadSessionModel


def _create_synthetic_m4a(path: str, duration_sec: int = 8) -> None:
    ffmpeg = get_ffmpeg_bin()
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        f"sine=frequency=440:duration={duration_sec}",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        path,
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    assert res.returncode == 0, f"FFmpeg failed: {res.stderr}"


def test_magic_byte_validation():
    assert validate_audio_magic_bytes(b"\x00\x00\x00\x20ftypM4A \x00\x00\x00\x00")[0] is True
    assert validate_audio_magic_bytes(b"RIFF\x24\x00\x00\x00WAVEfmt ")[0] is True
    assert validate_audio_magic_bytes(b"OggS\x00\x02\x00\x00")[0] is True
    assert validate_audio_magic_bytes(b"ID3\x04\x00\x00\x00")[0] is True

    # Reject spoofed executables, HTML, PDF, and empty payloads
    assert validate_audio_magic_bytes(b"MZ\x90\x00\x03\x00\x00\x00")[0] is False
    assert validate_audio_magic_bytes(b"<!DOCTYPE html><html>")[0] is False
    assert validate_audio_magic_bytes(b"%PDF-1.7\n")[0] is False
    assert validate_audio_magic_bytes(b"abc")[0] is False


def test_silence_aware_plan_split_windows_for_1_hour():
    # Short call (< 12 min) -> single window
    short_wins = plan_split_windows(600.0, [(120.0, 122.0)])
    assert short_wins == [(0.0, 600.0)]

    # 60-minute call with natural silence pauses near 10m, 20m, 30m, 40m, 50m
    silences = [
        (604.0, 606.0),   # mid 605
        (1189.0, 1191.0), # mid 1190
        (1809.0, 1811.0), # mid 1810
        (2401.0, 2403.0), # mid 2402
        (2994.0, 2996.0), # mid 2995
    ]
    windows = plan_split_windows(3600.0, silences, target_chunk_sec=600.0, overlap_sec=5.0)
    assert len(windows) >= 6
    assert windows[0][0] == 0.0
    assert windows[-1][1] == 3600.0
    # Verify consecutive overlap exists (~5 seconds)
    for i in range(1, len(windows)):
        prev_start, prev_end = windows[i - 1]
        cur_start, cur_end = windows[i]
        assert cur_start < prev_end, f"Gap found between chunk {i-1} and {i}"
        assert (prev_end - cur_start) >= 4.5
        assert cur_end > cur_start


def test_ffmpeg_probe_and_chunk_extract():
    tmp_dir = tempfile.mkdtemp(prefix="qa_chunk_test_")
    try:
        src = os.path.join(tmp_dir, "sample.m4a")
        chunk = os.path.join(tmp_dir, "chunk.m4a")
        _create_synthetic_m4a(src, duration_sec=8)
        dur = probe_audio_duration(src)
        assert 7.5 <= dur <= 8.5

        extract_audio_chunk(src, 2.0, 6.0, chunk)
        assert os.path.isfile(chunk)
        chunk_dur = probe_audio_duration(chunk)
        assert 3.5 <= chunk_dur <= 4.5
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def test_merge_chunk_transcripts_and_forbidden_guard():
    chunk_records = [
        {
            "chunk_index": 0,
            "start_seconds": 0.0,
            "end_seconds": 602.5,
            "acoustic_notes": "[00:00 - 10:02] Polite opening.",
            "transcript": [
                {"speaker": "Sales Rep", "isRep": True, "seconds": 5, "text": "Hello, how can I help?"},
                {"speaker": "Customer", "isRep": False, "seconds": 600, "text": "Can you share the pricing sheet today?"},
            ],
        },
        {
            "chunk_index": 1,
            "start_seconds": 597.5,
            "end_seconds": 1200.0,
            "acoustic_notes": "[09:57 - 20:00] Rep sounded impatient.",
            "transcript": [
                # Duplicate from overlap window
                {"speaker": "Customer", "isRep": False, "seconds": 600, "text": "Can you share the pricing sheet today?"},
                {"speaker": "Sales Rep", "isRep": True, "seconds": 3665, "text": "Shut up and pay now."},
            ],
        },
    ]
    merged, notes = merge_chunk_transcripts(chunk_records, overlap_sec=5.0)
    assert len(merged) == 3  # Overlap duplicate removed!
    assert merged[0]["id"] == "t-1"
    assert merged[2]["timestamp"] == format_timestamp(3665) == "01:01:05"
    assert "Polite opening" in notes and "impatient" in notes

    # Deterministic forbidden phrase override
    cfg = AnalysisConfigInput(customForbiddenPhrases=["shut up"])
    report = AnalysisReport(
        callId="c-1",
        fileName="test.m4a",
        fileSize="1.0 MB",
        duration="01:01:05",
        uploadedAt="now",
        status="completed",
        tone=ToneAnalysisResult(
            rating="GREEN",
            headline="Looked fine",
            explanation="Test",
            evidenceQuotes=[],
            confidenceScore=90,
            sentimentBreakdown=SentimentBreakdown(
                repProfessionalism=90, repEmpathy=90, repPatience=90, customerFrustration=10
            ),
        ),
        actionItems=[],
        transcript=[TranscriptSegment(**s) for s in merged],
        configUsed=cfg,
    )
    guarded = _enforce_forbidden_phrases_guard(report, cfg)
    assert guarded.tone.rating == "RED"
    assert any("shut up" in eq.quote.lower() for eq in guarded.tone.evidenceQuotes)


def test_chunked_upload_dedupe_magic_reject_and_range_stream(monkeypatch):
    # Patch chunk size to 2048 bytes so a small real .m4a splits into multiple chunks
    monkeypatch.setattr(main, "CHUNK_SIZE_BYTES", 2048)

    tmp_dir = tempfile.mkdtemp(prefix="qa_upload_test_")
    created_asset_id = None
    created_upload_ids = []
    client = TestClient(main.app)

    try:
        audio_path = os.path.join(tmp_dir, "synthetic.m4a")
        _create_synthetic_m4a(audio_path, duration_sec=4)
        with open(audio_path, "rb") as f:
            raw_bytes = f.read()
        assert len(raw_bytes) > 4096
        sha_full = hashlib.sha256(raw_bytes).hexdigest()

        # 1. Spoofed .exe renamed to .m4a should be rejected on chunk 0
        spoof_bytes = b"MZ\x90\x00" + b"\x00" * 3000
        spoof_sha = hashlib.sha256(spoof_bytes).hexdigest()
        r_spoof_init = client.post(
            "/api/uploads/init",
            json={"filename": "fake.m4a", "mimeType": "audio/mp4", "sizeBytes": len(spoof_bytes), "sha256": spoof_sha},
        )
        assert r_spoof_init.status_code == 200
        spoof_id = r_spoof_init.json()["uploadId"]
        created_upload_ids.append(spoof_id)
        r_spoof_chunk = client.put(
            f"/api/uploads/{spoof_id}/chunk/0",
            files={"chunk": ("part0", spoof_bytes[:2048], "application/octet-stream")},
        )
        assert r_spoof_chunk.status_code == 400
        assert "signature" in r_spoof_chunk.json()["detail"].lower()

        # 2. Valid multi-chunk upload
        r_init = client.post(
            "/api/uploads/init",
            json={"filename": "call_test.m4a", "mimeType": "audio/mp4", "sizeBytes": len(raw_bytes), "sha256": sha_full},
        )
        assert r_init.status_code == 200
        init_data = r_init.json()
        assert init_data["deduplicated"] is False
        upload_id = init_data["uploadId"]
        created_upload_ids.append(upload_id)
        total_chunks = init_data["totalChunks"]
        assert total_chunks >= 2

        for idx in range(total_chunks):
            part = raw_bytes[idx * 2048 : (idx + 1) * 2048]
            r_put = client.put(
                f"/api/uploads/{upload_id}/chunk/{idx}",
                files={"chunk": (f"part{idx}", part, "application/octet-stream")},
            )
            assert r_put.status_code == 200

        r_comp = client.post(f"/api/uploads/{upload_id}/complete")
        assert r_comp.status_code == 200
        comp_data = r_comp.json()
        created_asset_id = comp_data["assetId"]
        assert comp_data["sizeBytes"] == len(raw_bytes)
        assert comp_data["durationSeconds"] > 3.0

        # 3. Deduplication check on second init with same sha256
        r_dedup = client.post(
            "/api/uploads/init",
            json={"filename": "call_test_copy.m4a", "mimeType": "audio/mp4", "sizeBytes": len(raw_bytes), "sha256": sha_full},
        )
        assert r_dedup.status_code == 200
        assert r_dedup.json()["deduplicated"] is True
        assert r_dedup.json()["assetId"] == created_asset_id

        # 4. HTTP 206 Partial Content Range streaming check
        r_range = client.get(f"/api/assets/{created_asset_id}/stream", headers={"Range": "bytes=0-127"})
        assert r_range.status_code == 206
        assert r_range.headers["content-range"] == f"bytes 0-127/{len(raw_bytes)}"
        assert len(r_range.content) == 128
        assert r_range.content == raw_bytes[:128]
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
        db = SessionLocal()
        try:
            for uid in created_upload_ids:
                storage_provider.delete_upload_tmp(uid)
                db.query(UploadSessionModel).filter(UploadSessionModel.id == uid).delete()
            if created_asset_id:
                asset = db.query(AudioAssetModel).filter(AudioAssetModel.id == created_asset_id).first()
                if asset:
                    storage_provider.delete_asset(asset.storage_key)
                    db.delete(asset)
            db.commit()
        finally:
            db.close()
