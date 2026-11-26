# Situational System Design: Authentication, Multi-Tenancy & API Hardening

> **Scope:** `Audio-QA-Tester` (`anb_office` branch) — React + TypeScript + FastAPI + Neon PostgreSQL.

---

## 1. The Problem Statement

Right now, `Audio-QA-Tester` is completely unauthenticated and single-tenant. Deploying it publicly on the internet creates **5 critical security vulnerabilities**:

1. **Unauthenticated AI & Destructive Endpoints (`main.py`):**
   * Anyone on the web can call `POST /api/analyze/async` (draining your `GEMINI_API_KEY` credits), `DELETE /api/cache` (wiping everyone's cached transcripts), or `DELETE /api/history/{id}` (deleting records).
2. **Zero Multi-Tenant Data Isolation (`models.py`, `main.py`):**
   * All `CallAuditModel`, `AudioAssetModel`, `CommitmentModel`, and `AnalysisJobModel` rows sit in a global pool. Anyone who guesses or lists `/api/history` or `/api/assets/{asset_id}/stream` can listen to another company's private sales call recordings.
3. **Invalid & Over-Permissive CORS (`main.py` lines 65–72):**
   * Configures `allow_origins=["*"]` together with `allow_credentials=True`—which browsers reject for credentialed cookies/requests and leaves open cross-origin exposure.
4. **No Role-Based Access Control (RBAC):**
   * No distinction between an `ADMIN` (who can clear caches, delete audits, or view org-wide billing/token dashboards) and a standard `USER` / `REVIEWER`.
5. **Unauthenticated SSE & Audio `<audio src="...">` Streaming:**
   * Browser `<audio>` tags and `EventSource` cannot natively attach `Authorization: Bearer <token>` headers—meaning naive JWT header auth breaks audio playback and SSE unless designed with `HttpOnly` cookies or short-lived signed media tokens!

---

## 2. Chosen Production-Grade Solution (`JWT + HttpOnly Cookies + Org Isolation + Signed Media Tokens`)

We add lightweight, production-standard **JWT Authentication, Organization Multi-Tenancy (`org_id`), RBAC, and strict CORS** natively in FastAPI + Neon PostgreSQL + React (no paid Auth0/Clerk dependency required, though cleanly swappable):

```text
[React Client]
  ├─ Login / Register UI (or Demo Workspace sign-in)
  ├─ Sends credentials: 'include' (HttpOnly Secure Cookie) OR Authorization Bearer JWT
  └─ <audio src="/api/assets/{id}/stream?token=short_lived_signed_token">
     & EventSource("/api/jobs/{id}/events?token=...")
          │
          ▼
[FastAPI Security Layer]
  ├─ 1. Strict CORS Allowlist (CORS_ALLOWED_ORIGINS from .env, never "*" w/ credentials)
  ├─ 2. Security Headers Middleware (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
  ├─ 3. Auth Dependency (get_current_user) -> extracts { userId, orgId, role }
  ├─ 4. RBAC Guard (require_admin) -> protects DELETE /api/cache & admin actions
  └─ 5. Tenant Scoping -> EVERY DB query & cache key scoped by org_id!
```

### Key Architectural Components
1. **User & Organization Tables (`OrganizationModel`, `UserModel`):** Stores `id`, `name`, `daily_token_limit` (per-tenant daily cap, e.g. `500_000` tokens/day), `email` (unique), `password_hash` (`scrypt` salted hash), `org_id`, `role` (`ADMIN` | `MEMBER`), `created_at`.
2. **Tenant Isolation (`org_id` across all data models):** Add `org_id` to `AudioAssetModel`, `UploadSessionModel`, `AnalysisJobModel`, `CallAuditModel`, `CommitmentModel`, and `TokenUsageLedgerModel`, and scope Tier-1/Tier-2 cache keys by `org_id` (preventing cross-tenant cache leaks!).
3. **Per-Tenant Daily Token Quota & Next-Day Renewal:**
   * Query today's (`UTC YYYY-MM-DD`) token usage per `org_id` from `TokenUsageLedgerModel`.
   * Display **Tokens Used Today / Daily Limit**, remaining percentage, and **Next Renewal Time (`00:00 UTC`)** in the Dashboard & Navbar.
   * Block new analyses with `429 Too Many Requests` (`QUOTA_EXCEEDED` + `Retry-After` until midnight UTC) when a tenant's daily quota is exhausted—auto-renewing cleanly at `00:00 UTC` the next day!
4. **Auth Flows + Short-Lived Media/SSE Tokens:**
   * `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
   * Issues JWT in an **`HttpOnly; SameSite=Lax` cookie** (works seamlessly with `<audio>` tags, `EventSource` SSE, and `fetch(..., { credentials: 'include' })`!) plus optional Bearer token support for API clients.
   * For cross-origin deployments where cookies are tricky, issues short-lived (5-minute) scoped **HMAC media/SSE tokens** (`?media_token=...`) bound to `(asset_id, org_id)`.
5. **Strict CORS & Security Headers:** Read `CORS_ALLOWED_ORIGINS` from `.env` (defaulting to `http://localhost:3000,http://localhost:5173`).

---

## 3. All 10 Edge Cases Covered & How Each Is Solved

| # | Edge Case / Failure Mode | How Our Solution Solves It |
| :--- | :--- | :--- |
| **1** | **Cross-tenant data leak (`IDOR` on `/api/history/{id}` or `/api/assets/{id}/stream`)** | Every single DB lookup filters by `.filter(..., Model.org_id == current_user.org_id)`. Passing another org's valid UUID still returns `404 Not Found`. |
| **2** | **Cross-tenant Tier-1/Tier-2 cache poisoning / leak** | Cache keys become `{org_id}/{audio_hash}` and `{org_id}/{audio_hash}_{config_hash}` (and `AudioAsset` deduplication only matches within the **same `org_id`**), so Company B never hits Company A's cached transcript. |
| **3** | **Browser `<audio>` & `EventSource` failing when JWT is in `Authorization` header** | Native `<audio src>` and `EventSource` cannot send custom `Authorization` headers. Using **`HttpOnly` cookies** (`credentials: 'include'`) + short-lived scoped `?media_token=` query tokens solves both cleanly without exposing long-lived JWTs in URLs/logs. |
| **4** | **Anonymous cache wipe or history deletion (`DELETE /api/cache`)** | `DELETE /api/cache` requires `role == "ADMIN"`; `DELETE /api/history/{id}` verifies `org_id` ownership and RBAC permissions (`403 Forbidden` for unauthorized roles). |
| **5** | **Invalid CORS (`allow_origins=["*"]` + `allow_credentials=True`)** | Replaced with explicit `CORS_ALLOWED_ORIGINS` list from `.env`. `allow_credentials=True` only works securely with explicit origins. |
| **6** | **Password cracking / weak hashing** | Passwords hashed with salted **`scrypt` / `bcrypt`** (built-in `hashlib.scrypt` or `passlib`/`bcrypt`) with constant-time comparison (`hmac.compare_digest`), never plaintext or raw SHA-256. |
| **7** | **Token theft via XSS (`localStorage`)** | Storing the session JWT in an **`HttpOnly`** cookie prevents client-side JavaScript (`document.cookie`) from reading the token if an XSS bug ever occurs. |
| **8** | **CSRF attacks when using cookies** | Cookie uses `SameSite=Lax` + explicit CORS origin allowlist; mutating requests verify origin/custom header (`X-Requested-With` or JSON `Content-Type`). |
| **9** | **Brute-force login / registration spam** | Auth endpoints apply strict per-IP/per-email rate limiting (`5 attempts / minute`) with generic `"Invalid email or password"` error (preventing account enumeration). |
| **10** | **Smooth migration of existing historical calls in Neon DB** | Startup migration creates a default `"default-org"` / seeded workspace so pre-existing `call_audits` rows remain accessible to the initial admin account without breaking Neon data. |

---

## 4. Other Possible Options & Why We Chose This Design

### A. Authentication Provider
* **Option 1 — Managed Auth (Clerk / Auth0 / Supabase Auth):** Fast UI, *deferred* because it introduces external vendor keys, dashboard setup, and webhook syncing. Native FastAPI JWT + `HttpOnly` cookies keeps full ownership inside your backend and Neon PostgreSQL with zero third-party keys.
* **Option 2 — Basic API Key in Frontend `.env`:** *Rejected*—anything shipped in React's Vite bundle is publicly visible in browser DevTools.

### B. Session Mechanism
* **Option 1 — JWT stored in `localStorage`:** *Rejected*—vulnerable to XSS theft AND fails natively on `<audio src>` and `EventSource` without leaking JWTs in query URLs.
* **Option 2 — `HttpOnly` Cookie JWT + Short-Lived Scoped Media Tokens:** Secure against XSS, works natively with `<audio>` range requests and SSE, and stays stateless across horizontally scaled API servers.

---

## 5. Required Inputs & Configuration Checklist

* **Already Configured in `backend/.env`:**
  * `DATABASE_URL` (Neon PostgreSQL) ✅
* **New Env Vars (Auto-generated / configurable in `backend/.env`):**
  * `JWT_SECRET_KEY` — Strong random 32+ byte secret (you can provide one or we generate a dev secret automatically if unset).
  * `CORS_ALLOWED_ORIGINS` — e.g. `http://localhost:3000,http://localhost:5173`.
