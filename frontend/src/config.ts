// Centralized API configuration
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
