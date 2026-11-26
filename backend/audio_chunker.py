import os
import re
import subprocess
from dataclasses import dataclass
from typing import List, Tuple
import imageio_ffmpeg


# Calls shorter than 12 minutes use the single-pass multimodal path.
# Calls >= 12 minutes trigger silence-aware 10-minute Map-Reduce chunking.
CHUNKING_THRESHOLD_SECONDS = 12 * 60
TARGET_CHUNK_SECONDS = 10 * 60
CHUNK_OVERLAP_SECONDS = 5.0
SILENCE_SEARCH_WINDOW_SECONDS = 45.0


@dataclass
class AudioChunkSpec:
    index: int
    start_seconds: float
    end_seconds: float
    file_path: str


def get_ffmpeg_bin() -> str:
    """Returns the static FFmpeg binary bundled by imageio-ffmpeg."""
    return imageio_ffmpeg.get_ffmpeg_exe()


def format_timestamp(total_seconds: float) -> str:
    """Formats seconds as MM:SS (<1 hr) or HH:MM:SS (>=1 hr)."""
    sec = max(0, int(round(total_seconds)))
    hours, rem = divmod(sec, 3600)
    minutes, seconds = divmod(rem, 60)
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


def parse_timestamp_to_seconds(ts_str: str) -> int:
    """Parses 'MM:SS' or 'HH:MM:SS' safely to integer seconds."""
    if not ts_str:
        return 0
    parts = [p.strip() for p in str(ts_str).split(":")]
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + int(float(parts[1]))
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
    except ValueError:
        return 0
    return 0


def probe_audio_duration(file_path: str) -> float:
    """Probes total audio duration in seconds using FFmpeg."""
    ffmpeg = get_ffmpeg_bin()
    proc = subprocess.run(
        [ffmpeg, "-hide_banner", "-i", file_path],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    match = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", proc.stderr or "")
    if not match:
        return 0.0
    hours = int(match.group(1))
    minutes = int(match.group(2))
    seconds = float(match.group(3))
    return hours * 3600.0 + minutes * 60.0 + seconds


def detect_silences(
    file_path: str,
    noise_db: int = -35,
    min_silence_sec: float = 0.6,
) -> List[Tuple[float, float]]:
    """
    Runs FFmpeg silencedetect to identify natural pause intervals WITHOUT removing
    any audio (preserving 1:1 timestamp synchronization with the original player).
    """
    ffmpeg = get_ffmpeg_bin()
    proc = subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-i",
            file_path,
            "-af",
            f"silencedetect=noise={noise_db}dB:d={min_silence_sec}",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=180,
    )
    stderr = proc.stderr or ""
    starts = [float(m) for m in re.findall(r"silence_start:\s*([\d.]+)", stderr)]
    ends = [float(m) for m in re.findall(r"silence_end:\s*([\d.]+)", stderr)]

    intervals: List[Tuple[float, float]] = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else s + min_silence_sec
        intervals.append((s, max(s, e)))
    return intervals


def plan_split_windows(
    duration_sec: float,
    silences: List[Tuple[float, float]],
    target_chunk_sec: float = TARGET_CHUNK_SECONDS,
    overlap_sec: float = CHUNK_OVERLAP_SECONDS,
    search_window_sec: float = SILENCE_SEARCH_WINDOW_SECONDS,
) -> List[Tuple[float, float]]:
    """
    Plans overlapping (start_sec, end_sec) chunk windows around natural silence pauses
    so words are never cut mid-syllable and original timeline offsets are preserved.
    """
    if duration_sec <= 0:
        return [(0.0, 0.0)]

    if duration_sec <= CHUNKING_THRESHOLD_SECONDS:
        return [(0.0, round(duration_sec, 3))]

    windows: List[Tuple[float, float]] = []
    cursor = 0.0
    half_overlap = overlap_sec / 2.0

    while duration_sec - cursor > target_chunk_sec + 60.0:
        ideal_cut = cursor + target_chunk_sec
        win_low = max(cursor + 60.0, ideal_cut - search_window_sec)
        win_high = min(duration_sec - 30.0, ideal_cut + search_window_sec)

        best_cut = ideal_cut
        best_dist = float("inf")
        for s_start, s_end in silences:
            mid = (s_start + s_end) / 2.0
            if win_low <= mid <= win_high:
                dist = abs(mid - ideal_cut)
                if dist < best_dist:
                    best_dist = dist
                    best_cut = mid

        chunk_end = min(duration_sec, best_cut + half_overlap)
        windows.append((round(cursor, 3), round(chunk_end, 3)))
        cursor = max(0.0, best_cut - half_overlap)

    if cursor < duration_sec:
        windows.append((round(cursor, 3), round(duration_sec, 3)))

    return windows


def extract_audio_chunk(
    input_path: str,
    start_sec: float,
    end_sec: float,
    output_path: str,
) -> str:
    """
    Extracts [start_sec, end_sec] into a self-contained .m4a chunk.
    Uses fast stream-copy for compressed inputs when possible, falling back
    to compact 64 kbps mono AAC encoding (critical for large .wav files).
    """
    ffmpeg = get_ffmpeg_bin()
    duration = max(0.5, end_sec - start_sec)
    ext = os.path.splitext(input_path)[1].lower()

    # For WAV or when re-encoding ensures frame-accurate boundaries & compact Gemini uploads:
    if ext in (".m4a", ".mp4", ".aac"):
        copy_cmd = [
            ffmpeg,
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start_sec:.3f}",
            "-i",
            input_path,
            "-t",
            f"{duration:.3f}",
            "-vn",
            "-c:a",
            "copy",
            output_path,
        ]
        res = subprocess.run(copy_cmd, capture_output=True, text=True, timeout=180)
        if res.returncode == 0 and os.path.isfile(output_path) and os.path.getsize(output_path) > 0:
            return output_path

    encode_cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        f"{start_sec:.3f}",
        "-i",
        input_path,
        "-t",
        f"{duration:.3f}",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        output_path,
    ]
    res = subprocess.run(encode_cmd, capture_output=True, text=True, timeout=300)
    if res.returncode != 0 or not os.path.isfile(output_path):
        raise RuntimeError(f"FFmpeg chunk extraction failed: {res.stderr}")
    return output_path
