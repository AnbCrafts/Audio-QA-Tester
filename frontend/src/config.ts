// Same-origin /api by default (Vite dev proxy -> :8000, NGINX -> backend)
// Avoids cross-site localhost vs 127.0.0.1 SameSite cookie mismatches.
export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? '';

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
