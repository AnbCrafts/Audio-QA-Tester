import os
import sys
import time
import hmac
import uuid
import asyncio
import hashlib
import httpx
from fastapi.testclient import TestClient

import main
from database import SessionLocal, run_schema_migrations
from models import (
    OrganizationModel,
    UserModel,
    CallAuditModel,
    TranscriptSegmentModel,
    CommitmentModel,
    CacheEntryModel,
    AuditLogModel,
    WebhookEndpointModel,
    WebhookDeliveryModel,
    utcnow_naive,
)
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    ToneAnalysisResult,
    SentimentBreakdown,
    TranscriptSegment,
    ActionItem,
    EvidenceQuote,
    CallMetadata,
)
from auth_service import hash_password
from job_worker import compute_overall_score, persist_report_to_db
from cache_service import save_audio_base_cache, get_audio_base_cache
from webhook_service import sign_webhook_payload, deliver_to_endpoint
import eval_golden


run_schema_migrations()


def _cleanup_org(org_id: str) -> None:
    db = SessionLocal()
    try:
        db.query(WebhookDeliveryModel).filter(WebhookDeliveryModel.org_id == org_id).delete()
        db.query(WebhookEndpointModel).filter(WebhookEndpointModel.org_id == org_id).delete()
        db.query(AuditLogModel).filter(AuditLogModel.org_id == org_id).delete()
        db.query(CacheEntryModel).filter(CacheEntryModel.org_id == org_id).delete()
        db.query(CommitmentModel).filter(CommitmentModel.org_id == org_id).delete()
        audits = db.query(CallAuditModel).filter(CallAuditModel.org_id == org_id).all()
        for au in audits:
            db.delete(au)
        db.flush()
        db.query(UserModel).filter(UserModel.org_id == org_id).delete()
        db.query(OrganizationModel).filter(OrganizationModel.id == org_id).delete()
        db.commit()
    finally:
        db.close()


def _seed_org_and_users(prefix: str):
    org_id = f"org_{prefix}_{uuid.uuid4().hex[:8]}"
    admin_email = f"admin_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    member_email = f"member_{prefix}_{uuid.uuid4().hex[:6]}@example.com"
    db = SessionLocal()
    try:
        db.add(OrganizationModel(id=org_id, name=f"Workspace {prefix}", daily_token_limit=500_000))
        db.add(
            UserModel(
                email=admin_email,
                password_hash=hash_password("Secret123!"),
                full_name="Admin User",
                org_id=org_id,
                role="ADMIN",
            )
        )
        db.add(
            UserModel(
                email=member_email,
                password_hash=hash_password("Secret123!"),
                full_name="Member User",
                org_id=org_id,
                role="MEMBER",
            )
        )
        db.commit()
    finally:
        db.close()
    return org_id, admin_email, member_email


def _login_client(email: str, password: str = "Secret123!") -> TestClient:
    client = TestClient(main.app)
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return client


def _build_report(
    *,
    filename: str = "call_sample.m4a",
    rating: str = "GREEN",
    category: str = "B2B SaaS Sales",
    prof: int = 85,
    emp: int = 80,
    pat: int = 75,
    frust: int = 15,
    transcript_text: str = "We will send the updated pricing proposal by Friday.",
    deadline: str = "Friday 5 PM",
    quote: str = "",
) -> AnalysisReport:
    return AnalysisReport(
        callId=f"call_{uuid.uuid4().hex[:10]}",
        fileName=filename,
        fileSize="1.1 MB",
        duration="01:20",
        uploadedAt="now",
        status="completed",
        tone=ToneAnalysisResult(
            rating=rating,  # type: ignore[arg-type]
            headline="Severe escalation" if rating == "RED" else "Constructive conversation",
            explanation="Grounded QA test evaluation.",
            evidenceQuotes=(
                [EvidenceQuote(quote=quote, speaker="Sales Rep", explanation="Flagged", timestamp="00:12")]
                if quote
                else []
            ),
            confidenceScore=92,
            sentimentBreakdown=SentimentBreakdown(
                repProfessionalism=prof,
                repEmpathy=emp,
                repPatience=pat,
                customerFrustration=frust,
            ),
        ),
        actionItems=[
            ActionItem(
                id=f"act_{uuid.uuid4().hex[:8]}",
                task="Send pricing proposal",
                owner="Sales Rep",
                deadline=deadline,
                evidenceQuote=transcript_text,
                timestamp="00:12",
                seconds=12,
                confidence=95,
            )
        ],
        transcript=[
            TranscriptSegment(
                id=f"seg_{uuid.uuid4().hex[:8]}",
                speaker="Sales Rep",
                isRep=True,
                timestamp="00:12",
                seconds=12,
                text=transcript_text,
                isFlaggedEvidence=(rating == "RED"),
            )
        ],
        configUsed=AnalysisConfigInput(),
        callMetadata=CallMetadata(detectedCategory=category),
    )


def test_granular_red_overall_score():
    severe_red = _build_report(rating="RED", prof=20, emp=15, pat=10, frust=85)
    mild_red = _build_report(rating="RED", prof=60, emp=55, pat=50, frust=40)
    green_call = _build_report(rating="GREEN", prof=90, emp=88, pat=92, frust=10)

    s_severe = compute_overall_score(severe_red)
    s_mild = compute_overall_score(mild_red)
    s_green = compute_overall_score(green_call)

    assert 0.5 <= s_severe < s_mild <= 2.9
    assert 3.0 <= s_green <= 5.0


def test_coaching_insights_empty_and_populated():
    org_id, admin_email, _ = _seed_org_and_users("insights")
    try:
        client = _login_client(admin_email)
        empty_res = client.get("/api/analytics/insights")
        assert empty_res.status_code == 200
        assert empty_res.json()["totalCalls"] == 0

        r1 = _build_report(
            filename="escalated_call.m4a",
            rating="RED",
            category="Billing Dispute",
            prof=70,
            emp=40,
            pat=60,
            frust=80,
            quote="That is simply not our department problem.",
            deadline="Not specified",
        )
        r2 = _build_report(
            filename="healthy_call.m4a",
            rating="GREEN",
            category="Onboarding",
            prof=90,
            emp=60,
            pat=80,
            frust=10,
            deadline="Tomorrow 3 PM",
        )
        persist_report_to_db(r1, f"h1_{uuid.uuid4().hex[:8]}", None, org_id, f"ck1_{uuid.uuid4().hex[:8]}")
        persist_report_to_db(r2, f"h2_{uuid.uuid4().hex[:8]}", None, org_id, f"ck2_{uuid.uuid4().hex[:8]}")

        res = client.get("/api/analytics/insights")
        assert res.status_code == 200
        body = res.json()
        assert body["totalCalls"] == 2
        assert body["weakestDimension"] == "repEmpathy"
        assert body["weakestDimensionAvg"] == 50.0
        assert body["topEscalationCategory"] == "Billing Dispute"
        assert body["topEscalationRate"] == 100.0
        assert body["latestRedQuote"]["quote"] == "That is simply not our department problem."
        assert body["deadlineGroundingPct"] == 50.0
    finally:
        _cleanup_org(org_id)


def test_transcript_segment_edit_persists_and_syncs_tier1_cache():
    org_id, admin_email, _ = _seed_org_and_users("edit_seg")
    other_org, other_admin, _ = _seed_org_and_users("edit_other")
    try:
        audio_hash = f"ah_{uuid.uuid4().hex[:12]}"
        report = _build_report(transcript_text="Original garbled STT phrase.")
        persist_report_to_db(report, audio_hash, None, org_id, f"ck_{uuid.uuid4().hex[:8]}")

        save_audio_base_cache(
            audio_hash,
            {"transcript": [seg.model_dump() for seg in report.transcript], "duration": "01:20"},
            org_id=org_id,
        )

        client = _login_client(admin_email)
        seg_id = report.transcript[0].id
        patch_res = client.patch(
            f"/api/history/{report.callId}/transcript/{seg_id}",
            json={"text": "Corrected human-verified transcript line.", "speaker": "Customer"},
        )
        assert patch_res.status_code == 200, patch_res.text
        assert patch_res.json()["text"] == "Corrected human-verified transcript line."
        assert patch_res.json()["speaker"] == "Customer"

        # DB persisted
        detail = client.get(f"/api/history/{report.callId}").json()
        assert detail["transcript"][0]["text"] == "Corrected human-verified transcript line."

        # Tier-1 cache synced
        cached = get_audio_base_cache(audio_hash, org_id=org_id)
        assert cached is not None
        assert cached["transcript"][0]["text"] == "Corrected human-verified transcript line."

        # Cross-tenant isolation on PATCH
        other_client = _login_client(other_admin)
        iso_res = other_client.patch(
            f"/api/history/{report.callId}/transcript/{seg_id}",
            json={"text": "Malicious edit", "speaker": "Sales Rep"},
        )
        assert iso_res.status_code == 404
    finally:
        _cleanup_org(org_id)
        _cleanup_org(other_org)


def test_transcript_search_and_tenant_isolation():
    org_a, admin_a, _ = _seed_org_and_users("search_a")
    org_b, admin_b, _ = _seed_org_and_users("search_b")
    try:
        unique_token = f"quantumwidget{uuid.uuid4().hex[:6]}"
        r_a = _build_report(
            filename="enterprise_demo.m4a",
            transcript_text=f"We guarantee zero downtime on the {unique_token} deployment.",
        )
        r_b = _build_report(
            filename="other_org.m4a",
            transcript_text="Standard renewal follow-up discussion.",
        )
        persist_report_to_db(r_a, f"ha_{uuid.uuid4().hex[:8]}", None, org_a, f"cka_{uuid.uuid4().hex[:8]}")
        persist_report_to_db(r_b, f"hb_{uuid.uuid4().hex[:8]}", None, org_b, f"ckb_{uuid.uuid4().hex[:8]}")

        client_a = _login_client(admin_a)
        client_b = _login_client(admin_b)

        hist_res = client_a.get(f"/api/history?search={unique_token}")
        assert hist_res.status_code == 200
        items = hist_res.json()["items"]
        assert len(items) == 1
        assert items[0]["id"] == r_a.callId
        assert unique_token in (items[0]["matchedSnippet"] or "")
        assert items[0]["matchedSeconds"] == 12

        search_res = client_a.get(f"/api/search/transcripts?q={unique_token}")
        assert search_res.status_code == 200
        hits = search_res.json()["items"]
        assert len(hits) == 1
        assert hits[0]["callId"] == r_a.callId

        # Org B must not see Org A's spoken phrase
        b_hist = client_b.get(f"/api/history?search={unique_token}").json()
        b_search = client_b.get(f"/api/search/transcripts?q={unique_token}").json()
        assert b_hist["items"] == []
        assert b_search["items"] == []
    finally:
        _cleanup_org(org_a)
        _cleanup_org(org_b)


def test_admin_members_rbac_and_audit_logs():
    org_id, admin_email, member_email = _seed_org_and_users("rbac")
    try:
        member_client = _login_client(member_email)
        assert member_client.get("/api/org/members").status_code == 403
        assert member_client.get("/api/org/audit-logs").status_code == 403

        admin_client = _login_client(admin_email)
        new_email = f"analyst_{uuid.uuid4().hex[:6]}@example.com"
        create_res = admin_client.post(
            "/api/org/members",
            json={
                "email": new_email,
                "password": "Password123!",
                "fullName": "QA Analyst",
                "role": "MEMBER",
            },
        )
        assert create_res.status_code == 201, create_res.text
        created_id = create_res.json()["userId"]

        role_res = admin_client.patch(
            f"/api/org/members/{created_id}/role",
            json={"role": "ADMIN"},
        )
        assert role_res.status_code == 200
        assert role_res.json()["role"] == "ADMIN"

        logs_res = admin_client.get("/api/org/audit-logs")
        assert logs_res.status_code == 200
        actions = [item["action"] for item in logs_res.json()["items"]]
        assert "MEMBER_CREATED" in actions
        assert "MEMBER_ROLE_UPDATED" in actions
    finally:
        _cleanup_org(org_id)


def test_webhooks_ssrf_hmac_retry_and_dlq():
    org_id, admin_email, _ = _seed_org_and_users("webhook")
    try:
        client = _login_client(admin_email)

        # SSRF blocks private/metadata/non-https targets
        for bad_url in (
            "http://example.com/hook",
            "https://localhost/hook",
            "https://169.254.169.254/latest/meta-data",
            "https://10.0.0.5/hook",
        ):
            bad_res = client.post("/api/org/webhooks", json={"url": bad_url})
            assert bad_res.status_code == 400, f"Expected 400 for {bad_url}, got {bad_res.status_code}"

        good_res = client.post(
            "/api/org/webhooks",
            json={
                "url": "https://hooks.example.com/qa-events",
                "events": ["call.completed", "call.red_flag_detected"],
            },
        )
        assert good_res.status_code == 201, good_res.text
        wh_id = good_res.json()["id"]

        # Retrieve raw secret from DB to verify HMAC signature
        db = SessionLocal()
        try:
            ep = db.query(WebhookEndpointModel).filter(WebhookEndpointModel.id == wh_id).first()
            assert ep is not None
            raw_secret = ep.secret
        finally:
            db.close()

        # 1. Transient failure then success (200 on attempt 2) + signature check
        attempt_counter = {"n": 0}
        captured_headers = {}

        def _retry_handler(request: httpx.Request) -> httpx.Response:
            attempt_counter["n"] += 1
            if attempt_counter["n"] == 1:
                return httpx.Response(502, text="Bad Gateway")
            sig_header = request.headers.get("X-Inflect-Signature", "")
            captured_headers["sig"] = sig_header
            parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
            expected = sign_webhook_payload(raw_secret, parts["t"], request.content)
            assert hmac.compare_digest(expected, sig_header)
            return httpx.Response(200, json={"ok": True})

        status_ok = asyncio.run(
            deliver_to_endpoint(
                org_id=org_id,
                endpoint_id=wh_id,
                url="https://hooks.example.com/qa-events",
                secret=raw_secret,
                event_type="call.red_flag_detected",
                payload={"callId": "c1", "tone": "RED"},
                max_attempts=3,
                transport=httpx.MockTransport(_retry_handler),
            )
        )
        assert status_ok == "DELIVERED"
        assert attempt_counter["n"] == 2

        # 2. Persistent 500 leads to DEAD_LETTER after 3 attempts
        dlq_status = asyncio.run(
            deliver_to_endpoint(
                org_id=org_id,
                endpoint_id=wh_id,
                url="https://hooks.example.com/qa-events",
                secret=raw_secret,
                event_type="call.completed",
                payload={"callId": "c2"},
                max_attempts=3,
                transport=httpx.MockTransport(lambda req: httpx.Response(500, text="Server Error")),
            )
        )
        assert dlq_status == "DEAD_LETTER"

        deliv_res = client.get(f"/api/org/webhooks/{wh_id}/deliveries")
        assert deliv_res.status_code == 200
        statuses = {d["status"] for d in deliv_res.json()}
        assert "DELIVERED" in statuses
        assert "DEAD_LETTER" in statuses
    finally:
        _cleanup_org(org_id)


def test_eval_golden_dry_run_and_config_valid():
    for fname in ("test_call_green.m4a", "test_call_red.m4a", "test_call_multilingual.m4a"):
        resolved = eval_golden.resolve_fixture_path(fname)
        assert resolved is not None and os.path.isfile(resolved), f"Missing golden fixture {fname}"

    orig_argv = sys.argv
    try:
        sys.argv = ["eval_golden.py", "--dry-run"]
        rc = eval_golden.main()
        assert rc == 0
    finally:
        sys.argv = orig_argv
