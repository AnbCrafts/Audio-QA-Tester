import os
import re
import time
import shutil
import hashlib
from typing import Protocol, Tuple, Iterator, Optional
from fastapi import UploadFile
import aiofiles

# 5 MB per chunk; 500 MB max upload size
CHUNK_SIZE_BYTES = 5 * 1024 * 1024
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
UPLOAD_SESSION_TTL_SECONDS = 2 * 60 * 60  # 2 hours

BASE_UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
TMP_CHUNKS_DIR = os.path.join(BASE_UPLOADS_DIR, "tmp")
ASSETS_DIR = os.path.join(BASE_UPLOADS_DIR, "assets")

VALID_AUDIO_EXTENSIONS = (".m4a", ".mp3", ".wav", ".ogg", ".aac")

MIME_BY_EXT = {
    ".m4a": "audio/mp4",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
}


def sanitize_filename(filename: str) -> str:
    """Strips directory components and unsafe characters from user-supplied filenames."""
    base = os.path.basename(filename or "recording.m4a")
    cleaned = re.sub(r"[^a-zA-Z0-9._-]", "_", base).strip("._")
    return cleaned or "recording.m4a"


def validate_audio_magic_bytes(header: bytes) -> Tuple[bool, Optional[str]]:
    """
    Inspects the leading bytes of a file to verify it is a genuine audio container/stream
    and not a spoofed executable, HTML, PDF, or archive.
    Returns (is_valid, detected_format_label).
    """
    if not header or len(header) < 4:
        return False, None

    # ISO Base Media File Format (.m4a / .mp4 audio) -> 'ftyp' at offset 4
    if len(header) >= 8 and header[4:8] == b"ftyp":
        return True, "audio/mp4"

    # WAV -> 'RIFF....WAVE'
    if len(header) >= 12 and header[:4] == b"RIFF" and header[8:12] == b"WAVE":
        return True, "audio/wav"

    # OGG -> 'OggS'
    if header[:4] == b"OggS":
        return True, "audio/ogg"

    # MP3 with ID3v2 header
    if header[:3] == b"ID3":
        return True, "audio/mpeg"

    # AAC ADIF header
    if header[:4] == b"ADIF":
        return True, "audio/aac"

    # Raw MPEG / ADTS frame sync (0xFF followed by 0xE0+ mask)
    # ADTS AAC: 0xFF 0xF1 or 0xFF 0xF9
    if header[0] == 0xFF and (header[1] & 0xF6) == 0xF0:
        return True, "audio/aac"

    # Raw MP3 frame sync (0xFF followed by 0xE0..0xFE, layer bits != 00)
    if header[0] == 0xFF and (header[1] & 0xE0) == 0xE0 and (header[1] & 0x06) != 0x00:
        return True, "audio/mpeg"

    return False, None


class StorageProvider(Protocol):
    """Abstraction layer so LocalDiskStorageProvider can be swapped for S3/R2/Supabase later."""

    async def save_chunk(self, upload_id: str, chunk_index: int, upload_file: UploadFile, max_chunk_bytes: int) -> Tuple[int, bytes]:
        ...

    def assemble_chunks(self, upload_id: str, total_chunks: int, asset_id: str, ext: str) -> Tuple[str, int, str]:
        ...

    def get_local_path(self, storage_key: str) -> str:
        ...

    def iter_file_range(self, storage_key: str, start: int, end: int, chunk_size: int = 65536) -> Iterator[bytes]:
        ...

    def get_file_size(self, storage_key: str) -> int:
        ...

    def delete_upload_tmp(self, upload_id: str) -> None:
        ...

    def delete_asset(self, storage_key: str) -> None:
        ...

    def cleanup_stale_tmp(self, max_age_seconds: int = UPLOAD_SESSION_TTL_SECONDS) -> int:
        ...


class LocalDiskStorageProvider:
    """
    Streams chunks to backend/uploads/tmp/{upload_id}/ and assembles finalized assets
    into backend/uploads/assets/{asset_id}{ext} without buffering large files in RAM.
    """

    def __init__(self, tmp_dir: str = TMP_CHUNKS_DIR, assets_dir: str = ASSETS_DIR):
        self.tmp_dir = tmp_dir
        self.assets_dir = assets_dir
        os.makedirs(self.tmp_dir, exist_ok=True)
        os.makedirs(self.assets_dir, exist_ok=True)

    def _chunk_dir(self, upload_id: str) -> str:
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "", upload_id)
        return os.path.join(self.tmp_dir, safe_id)

    def _chunk_path(self, upload_id: str, chunk_index: int) -> str:
        return os.path.join(self._chunk_dir(upload_id), f"part_{chunk_index:06d}")

    async def save_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        upload_file: UploadFile,
        max_chunk_bytes: int = CHUNK_SIZE_BYTES + 1024,
    ) -> Tuple[int, bytes]:
        """
        Streams an incoming chunk in 64 KB reads directly to disk.
        Returns (bytes_written, leading_bytes_for_magic_check).
        """
        cdir = self._chunk_dir(upload_id)
        os.makedirs(cdir, exist_ok=True)
        dest_path = self._chunk_path(upload_id, chunk_index)

        total_written = 0
        leading_bytes = bytearray()

        try:
            async with aiofiles.open(dest_path, "wb") as out:
                while True:
                    piece = await upload_file.read(65536)
                    if not piece:
                        break
                    total_written += len(piece)
                    if total_written > max_chunk_bytes:
                        raise ValueError(f"Chunk {chunk_index} exceeds maximum chunk size ({max_chunk_bytes} bytes).")
                    if len(leading_bytes) < 64:
                        need = 64 - len(leading_bytes)
                        leading_bytes.extend(piece[:need])
                    await out.write(piece)
        except Exception:
            if os.path.exists(dest_path):
                try:
                    os.remove(dest_path)
                except OSError:
                    pass
            raise

        return total_written, bytes(leading_bytes)

    def assemble_chunks(
        self,
        upload_id: str,
        total_chunks: int,
        asset_id: str,
        ext: str,
    ) -> Tuple[str, int, str]:
        """
        Streams part files sequentially into the final asset file and computes SHA-256
        in 64 KB increments (zero full-file RAM buffering).
        Returns (storage_key, total_bytes, sha256_prefix_24).
        """
        safe_ext = ext if ext in VALID_AUDIO_EXTENSIONS else ".m4a"
        storage_key = f"{asset_id}{safe_ext}"
        final_path = os.path.join(self.assets_dir, storage_key)
        tmp_final_path = f"{final_path}.assembling"

        hasher = hashlib.sha256()
        total_bytes = 0

        try:
            with open(tmp_final_path, "wb") as dst:
                for idx in range(total_chunks):
                    part_path = self._chunk_path(upload_id, idx)
                    if not os.path.isfile(part_path):
                        raise FileNotFoundError(f"Missing upload chunk {idx} for upload {upload_id}")
                    with open(part_path, "rb") as src:
                        while True:
                            buf = src.read(65536)
                            if not buf:
                                break
                            dst.write(buf)
                            hasher.update(buf)
                            total_bytes += len(buf)
            os.replace(tmp_final_path, final_path)
        except Exception:
            if os.path.exists(tmp_final_path):
                try:
                    os.remove(tmp_final_path)
                except OSError:
                    pass
            raise
        finally:
            self.delete_upload_tmp(upload_id)

        return storage_key, total_bytes, hasher.hexdigest()[:24]

    def get_local_path(self, storage_key: str) -> str:
        safe_key = os.path.basename(storage_key)
        return os.path.join(self.assets_dir, safe_key)

    def get_file_size(self, storage_key: str) -> int:
        return os.path.getsize(self.get_local_path(storage_key))

    def iter_file_range(
        self,
        storage_key: str,
        start: int,
        end: int,
        chunk_size: int = 65536,
    ) -> Iterator[bytes]:
        path = self.get_local_path(storage_key)
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                to_read = min(chunk_size, remaining)
                data = f.read(to_read)
                if not data:
                    break
                remaining -= len(data)
                yield data

    def delete_upload_tmp(self, upload_id: str) -> None:
        cdir = self._chunk_dir(upload_id)
        if os.path.isdir(cdir):
            shutil.rmtree(cdir, ignore_errors=True)

    def delete_asset(self, storage_key: str) -> None:
        path = self.get_local_path(storage_key)
        if os.path.isfile(path):
            try:
                os.remove(path)
            except OSError:
                pass

    def cleanup_stale_tmp(self, max_age_seconds: int = UPLOAD_SESSION_TTL_SECONDS) -> int:
        removed = 0
        now = time.time()
        if not os.path.isdir(self.tmp_dir):
            return 0
        for entry in os.scandir(self.tmp_dir):
            if entry.is_dir():
                try:
                    age = now - entry.stat().st_mtime
                    if age > max_age_seconds:
                        shutil.rmtree(entry.path, ignore_errors=True)
                        removed += 1
                except OSError:
                    pass
        return removed


storage_provider = LocalDiskStorageProvider()
