import os
import hmac
import json
import time
import socket
import asyncio
import hashlib
import ipaddress
from urllib.parse import urlparse
from typing import Dict, Any, Optional, List
import httpx
from database import SessionLocal
from models import AuditLogModel, WebhookEndpointModel, WebhookDeliveryModel, utcnow_naive


def record_audit_log(
    db,
    *,
    org_id: str,
    actor_user_id: str,
    actor_email: str,
    action: str,
    target_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Appends an immutable workspace audit log entry inside the active transaction."""
    db.add(
        AuditLogModel(
            org_id=org_id,
            actor_user_id=actor_user_id,
            actor_email=actor_email,
            action=action,
            target_id=target_id,
            metadata_json=metadata or {},
            created_at=utcnow_naive(),
        )
    )


def validate_webhook_url(url: str) -> str:
    """
    Validates outbound webhook URLs with SSRF protection:
    - Requires https:// (http:// only allowed if ALLOW_DEV_WEBHOOKS=true)
    - Blocks link-local (169.254.169.254), loopback, and private RFC1918 networks
    """
    cleaned = (url or "").strip()
    parsed = urlparse(cleaned)
    allow_dev = os.getenv("ALLOW_DEV_WEBHOOKS", "false").lower() == "true"

    if parsed.scheme not in ("https", "http"):
        raise ValueError("Webhook URL must use https://")
    if parsed.scheme == "http" and not allow_dev:
        raise ValueError("Webhook URL must use https:// (set ALLOW_DEV_WEBHOOKS=true for local HTTP testing).")
    if not parsed.hostname:
        raise ValueError("Webhook URL must contain a valid hostname.")

    host = parsed.hostname.lower()
    if host in ("localhost", "0.0.0.0", "127.0.0.1", "::1") and not allow_dev:
        raise ValueError("Webhook URL cannot target loopback/local addresses.")

    try:
        ip = ipaddress.ip_address(host)
        if not allow_dev and (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast):
            raise ValueError("Webhook URL cannot target private or link-local IP ranges.")
    except ValueError as ve:
        if "cannot target" in str(ve):
            raise
        # Hostname (not literal IP): resolve safely if reachable and block metadata/private IPs
        try:
            infos = socket.getaddrinfo(host, None)
            for info in infos:
                resolved_ip = ipaddress.ip_address(info[4][0])
                if not allow_dev and (
                    resolved_ip.is_private
                    or resolved_ip.is_loopback
                    or resolved_ip.is_link_local
                    or resolved_ip.is_reserved
                ):
                    raise ValueError("Webhook hostname resolves to a restricted internal IP.")
        except socket.gaierror:
            # Allow saving domain names in offline/test environments without DNS failure
            pass

    return cleaned


def sign_webhook_payload(secret: str, timestamp: str, body_bytes: bytes) -> str:
    signed_content = f"{timestamp}.".encode("utf-8") + body_bytes
    digest = hmac.new(secret.encode("utf-8"), signed_content, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


async def deliver_to_endpoint(
    *,
    org_id: str,
    endpoint_id: str,
    url: str,
    secret: str,
    event_type: str,
    payload: Dict[str, Any],
    max_attempts: int = 3,
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> str:
    """
    Delivers a signed webhook event with exponential backoff and persists delivery state
    (PENDING -> DELIVERED or DEAD_LETTER).
    """
    db = SessionLocal()
    delivery = WebhookDeliveryModel(
        org_id=org_id,
        endpoint_id=endpoint_id,
        event_type=event_type,
        payload_json=payload,
        status="PENDING",
        attempts=0,
    )
    db.add(delivery)
    db.commit()
    db.refresh(delivery)
    delivery_id = delivery.id
    db.close()

    body_bytes = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    last_err = None
    delivered = False
    attempts_made = 0

    client_kwargs: Dict[str, Any] = {"timeout": 8.0}
    if transport is not None:
        client_kwargs["transport"] = transport

    async with httpx.AsyncClient(**client_kwargs) as client:
        for attempt in range(1, max_attempts + 1):
            attempts_made = attempt
            ts = str(int(time.time()))
            sig = sign_webhook_payload(secret, ts, body_bytes)
            try:
                resp = await client.post(
                    url,
                    content=body_bytes,
                    headers={
                        "Content-Type": "application/json",
                        "X-Inflect-Event": event_type,
                        "X-Inflect-Signature": sig,
                    },
                )
                if 200 <= resp.status_code < 300:
                    delivered = True
                    break
                last_err = f"HTTP {resp.status_code}: {resp.text[:160]}"
            except Exception as exc:
                last_err = str(exc)[:200]

            if attempt < max_attempts:
                await asyncio.sleep(0.25 * (2 ** (attempt - 1)))

    final_status = "DELIVERED" if delivered else "DEAD_LETTER"
    db = SessionLocal()
    try:
        row = db.query(WebhookDeliveryModel).filter(WebhookDeliveryModel.id == delivery_id).first()
        if row:
            row.status = final_status
            row.attempts = attempts_made
            row.last_error = None if delivered else last_err
            db.commit()
    finally:
        db.close()

    return final_status


async def dispatch_webhook_event(
    org_id: str,
    event_type: str,
    payload: Dict[str, Any],
    transport: Optional[httpx.AsyncBaseTransport] = None,
) -> List[str]:
    """Finds active webhook endpoints subscribed to event_type and dispatches asynchronously."""
    db = SessionLocal()
    try:
        endpoints = (
            db.query(WebhookEndpointModel)
            .filter(WebhookEndpointModel.org_id == org_id, WebhookEndpointModel.is_active == True)
            .all()
        )
        matching = [
            (e.id, e.url, e.secret)
            for e in endpoints
            if event_type in (e.events_json or [])
        ]
    finally:
        db.close()

    if not matching:
        return []

    results = await asyncio.gather(
        *[
            deliver_to_endpoint(
                org_id=org_id,
                endpoint_id=eid,
                url=url,
                secret=secret,
                event_type=event_type,
                payload=payload,
                transport=transport,
            )
            for eid, url, secret in matching
        ],
        return_exceptions=True,
    )
    return [str(r) for r in results]
