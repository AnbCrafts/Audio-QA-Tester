/**
 * Chunked Resumable Upload & Streaming SHA-256 Fingerprinting Client.
 * Avoids loading large 500 MB files fully into browser RAM during hashing or upload.
 */

const HASH_SLICE_BYTES = 4 * 1024 * 1024; // 4 MB hash slices

// Standard FIPS 180-4 SHA-256 incremental hasher for large files in low memory
class IncrementalSha256 {
  private readonly K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  private state = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  private buffer = new Uint8Array(64);
  private bufferLen = 0;
  private totalBytes = 0;
  private w = new Uint32Array(64);

  update(data: Uint8Array): void {
    let offset = 0;
    this.totalBytes += data.length;
    while (offset < data.length) {
      const space = 64 - this.bufferLen;
      const take = Math.min(space, data.length - offset);
      this.buffer.set(data.subarray(offset, offset + take), this.bufferLen);
      this.bufferLen += take;
      offset += take;
      if (this.bufferLen === 64) {
        this.compress(this.buffer);
        this.bufferLen = 0;
      }
    }
  }

  digestHex(): string {
    const bitLen = this.totalBytes * 8;
    const padBuf = new Uint8Array(this.bufferLen < 56 ? 64 : 128);
    padBuf.set(this.buffer.subarray(0, this.bufferLen));
    padBuf[this.bufferLen] = 0x80;
    const view = new DataView(padBuf.buffer);
    const high = Math.floor(bitLen / 0x100000000);
    const low = bitLen >>> 0;
    view.setUint32(padBuf.length - 8, high, false);
    view.setUint32(padBuf.length - 4, low, false);

    this.compress(padBuf.subarray(0, 64));
    if (padBuf.length === 128) {
      this.compress(padBuf.subarray(64, 128));
    }

    return Array.from(this.state)
      .map((v) => v.toString(16).padStart(8, '0'))
      .join('');
  }

  private compress(block: Uint8Array): void {
    const view = new DataView(block.buffer, block.byteOffset, 64);
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
      const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = this.state;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + this.K[i] + w[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    this.state[0] = (this.state[0] + a) >>> 0;
    this.state[1] = (this.state[1] + b) >>> 0;
    this.state[2] = (this.state[2] + c) >>> 0;
    this.state[3] = (this.state[3] + d) >>> 0;
    this.state[4] = (this.state[4] + e) >>> 0;
    this.state[5] = (this.state[5] + f) >>> 0;
    this.state[6] = (this.state[6] + g) >>> 0;
    this.state[7] = (this.state[7] + h) >>> 0;
  }
}

export async function computeStreamingSha256(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  // Fast native path for small files <= 32 MB when crypto.subtle is available
  if (file.size <= 32 * 1024 * 1024 && typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await file.arrayBuffer();
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    onProgress?.(100);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const hasher = new IncrementalSha256();
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + HASH_SLICE_BYTES, file.size);
    const chunkBuf = await file.slice(offset, end).arrayBuffer();
    hasher.update(new Uint8Array(chunkBuf));
    offset = end;
    onProgress?.(Math.round((offset / file.size) * 100));
  }
  return hasher.digestHex();
}

export interface ChunkUploadResult {
  assetId: string;
  deduplicated: boolean;
  audioUrl: string;
}

export async function uploadFileInChunks(
  file: File,
  apiBaseUrl: string,
  onStatus: (pct: number, stepText: string) => void
): Promise<ChunkUploadResult> {
  onStatus(2, 'Fingerprinting audio (SHA-256) for deduplication...');
  const sha256 = await computeStreamingSha256(file, (hashPct) => {
    onStatus(Math.max(2, Math.round(hashPct * 0.08)), `Fingerprinting audio (${hashPct}%)...`);
  });

  const initRes = await fetch(`${apiBaseUrl}/api/uploads/init`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      mimeType: file.type || 'audio/mp4',
      sizeBytes: file.size,
      sha256,
    }),
  });

  if (!initRes.ok) {
    const errJson = await initRes.json().catch(() => ({}));
    throw new Error(errJson.detail || `Failed to initialize upload (${initRes.status})`);
  }

  const initData = await initRes.json();
  if (initData.deduplicated && initData.assetId) {
    onStatus(100, 'Audio fingerprint matched existing asset (0 bytes uploaded)!');
    return {
      assetId: initData.assetId,
      deduplicated: true,
      audioUrl: `${apiBaseUrl}/api/assets/${initData.assetId}/stream`,
    };
  }

  const { uploadId, chunkSizeBytes, totalChunks, receivedChunks = [] } = initData;
  const completedSet = new Set<number>(receivedChunks);

  for (let idx = 0; idx < totalChunks; idx++) {
    if (completedSet.has(idx)) {
      const pct = 10 + Math.round(((idx + 1) / totalChunks) * 85);
      onStatus(pct, `Resuming upload: skipped verified chunk ${idx + 1}/${totalChunks}`);
      continue;
    }

    const start = idx * chunkSizeBytes;
    const end = Math.min(start + chunkSizeBytes, file.size);
    const slice = file.slice(start, end);

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const fd = new FormData();
        fd.append('chunk', slice, `${file.name}.part${idx}`);

        const chunkRes = await fetch(`${apiBaseUrl}/api/uploads/${uploadId}/chunk/${idx}`, {
          method: 'PUT',
          credentials: 'include',
          body: fd,
        });
        if (!chunkRes.ok) {
          const errJson = await chunkRes.json().catch(() => ({}));
          const err = new Error(errJson.detail || `Chunk ${idx + 1} failed (${chunkRes.status})`);
          // Do not retry deterministic 4xx errors (magic-byte rejection, size limit, etc.)
          if (chunkRes.status >= 400 && chunkRes.status < 500) {
            throw Object.assign(err, { nonRetryable: true });
          }
          throw err;
        }
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (err.nonRetryable || attempt === 3) break;
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    }

    if (lastErr) throw lastErr;

    const pct = 10 + Math.round(((idx + 1) / totalChunks) * 85);
    onStatus(pct, `Uploading audio chunk ${idx + 1} of ${totalChunks} (${pct}%)...`);
  }

  onStatus(97, 'Verifying checksum & assembling audio asset...');
  const completeRes = await fetch(`${apiBaseUrl}/api/uploads/${uploadId}/complete`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!completeRes.ok) {
    const errJson = await completeRes.json().catch(() => ({}));
    throw new Error(errJson.detail || `Upload completion failed (${completeRes.status})`);
  }

  const completeData = await completeRes.json();
  return {
    assetId: completeData.assetId,
    deduplicated: false,
    audioUrl: `${apiBaseUrl}${completeData.audioUrl}`,
  };
}
