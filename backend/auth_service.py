import os
import json
import hmac
import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Optional
from fastapi import Depends, HTTPException, Request

# Ephemeral dev fallback if JWT_SECRET_KEY is not configured
_RUNTIME_DEV_SECRET = secrets.token_urlsafe(32)
COOKIE_NAME = "scaleworks_token"


def _get_jwt_secret() -> bytes:
    secret = os.getenv("JWT_SECRET_KEY", "").strip() or _RUNTIME_DEV_SECRET
    return secret.encode("utf-8")


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(val: str) -> bytes:
    padding = "=" * ((4 - len(val) % 4) % 4)
    return base64.urlsafe_b64decode((val + padding).encode("ascii"))


def hash_password(password: str) -> str:
    """Hashes password with salted scrypt (no external C-extension issues)."""
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
    return f"{salt.hex()}${derived.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt_hex, hash_hex = stored_hash.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        derived = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=32)
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False


def create_signed_token(payload: dict, expires_in_seconds: int = 86400 * 7) -> str:
    import time
    header = {"alg": "HS256", "typ": "JWT"}
    body = {**payload, "exp": int(time.time()) + expires_in_seconds}
    h_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    b_b64 = _b64url_encode(json.dumps(body, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{h_b64}.{b_b64}".encode("ascii")
    sig = hmac.new(_get_jwt_secret(), signing_input, hashlib.sha256).digest()
    return f"{h_b64}.{b_b64}.{_b64url_encode(sig)}"


def decode_signed_token(token: str) -> Optional[dict]:
    import time
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        h_b64, b_b64, s_b64 = parts
        signing_input = f"{h_b64}.{b_b64}".encode("ascii")
        expected_sig = hmac.new(_get_jwt_secret(), signing_input, hashlib.sha256).digest()
        actual_sig = _b64url_decode(s_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(b_b64).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def create_media_token(asset_id: str, org_id: str, ttl_seconds: int = 600) -> str:
    return create_signed_token({"scope": "media", "assetId": asset_id, "orgId": org_id}, expires_in_seconds=ttl_seconds)


@dataclass
class AuthUser:
    user_id: str
    email: str
    full_name: str
    org_id: str
    org_name: str
    role: str  # "ADMIN" | "MEMBER"


def extract_auth_user_from_request(request: Request) -> Optional[AuthUser]:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header[7:].strip()
    if not token:
        return None

    payload = decode_signed_token(token)
    if not payload or payload.get("scope") == "media":
        return None
    if not payload.get("userId") or not payload.get("orgId"):
        return None

    return AuthUser(
        user_id=str(payload["userId"]),
        email=str(payload.get("email", "")),
        full_name=str(payload.get("fullName", "")),
        org_id=str(payload["orgId"]),
        org_name=str(payload.get("orgName", "Workspace")),
        role=str(payload.get("role", "MEMBER")),
    )


def get_current_user(request: Request) -> AuthUser:
    user = extract_auth_user_from_request(request)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    return user


def require_admin(user: AuthUser = Depends(get_current_user)) -> AuthUser:
    if user.role != "ADMIN":
        raise HTTPException(status_code=403, detail="Admin privileges required for this action.")
    return user
