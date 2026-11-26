import os
import sys
import uuid
import json
from types import SimpleNamespace
from datetime import timedelta
from fastapi.testclient import TestClient

import main
from database import SessionLocal
from models import (
    OrganizationModel,
    UserModel,
    CallAuditModel,
    CommitmentModel,
    AudioAssetModel,
    CacheEntryModel,
    TokenUsageLedgerModel,
    IdempotencyRecordModel,
    utcnow_naive,
)
from schemas import (
    AnalysisConfigInput,
    AnalysisReport,
    ToneAnalysisResult,
    SentimentBreakdown,
    TranscriptSegment,
    ActionItem,
)
from job_worker import persist_report_to_db
from cache_service import (
    save_audio_base_cache,
    get_audio_base_cache,
    save_cached_report,
    get_cached_report,
)
from traffic_guard import (
    TokenBucketRateLimiter,
    reserve_idempotency,
    complete_idempotency,
    analysis_rate_limiter,
    auth_rate_limiter,
)
from ai_gateway import (
    CircuitBreaker,
    CircuitOpenError,
    execute_with_retry_jitter,
)
from auth_service import hash_password
from storage_service import storage_provider
import audio_service


def _cleanup_org(org_id: str):
    db = SessionLocal()
    try:
        assets = db.query(AudioAssetModel).filter(AudioAssetModel.org_id == org_id).all()
        for a in assets:
            storage_provider.delete_asset(a.storage_key)
        db.query(TokenUsageLedgerModel).filter(TokenUsageLedgerModel.org_id == org_id).delete()
        db.query(IdempotencyRecordModel).filter(IdempotencyRecordModel.org_id == org_id).delete()
        db.query(CacheEntryModel).filter(CacheEntryModel.org_id == org_id).delete()
        db.query(CommitmentModel).filter(CommitmentModel.org_id == org_id).delete()
        audits = db.query(CallAuditModel).filter(CallAuditModel.org_id == org_id).all()
        for au in audits:
            db.delete(au)
        db.flush()
        db.query(AudioAssetModel).filter(AudioAssetModel.org_id == org_id).delete()
        db.query(UserModel).filter(UserModel.org_id == org_id).delete()
        db.query(OrganizationModel).filter(OrganizationModel.id == org_id).delete()
        db.commit()
    finally:
        db.close()


def _make_sample_report(filename: str = "sample.m4a", rating: str = "GREEN") -> AnalysisReport:
    return AnalysisReport(
        callId=f"call_{uuid.uuid4().hex[:8]}",
        fileName=filename,
        fileSize="1.2 MB",
        duration="01:10",
        uploadedAt="now",
        status="completed",
        tone=ToneAnalysisResult(
            rating=rating,
            headline="Polite rep" if rating == "GREEN" else "Hostile rep",
            explanation="Test explanation",
            evidenceQuotes=[],
            confidenceScore=90,
            sentimentBreakdown=SentimentBreakdown(
                repProfessionalism=90 if rating == "GREEN" else 30,
                repEmpathy=88 if rating == "GREEN" else 25,
                repPatience=92 if rating == "GREEN" else 20,
                customerFrustration=15 if rating == "GREEN" else 80,
            ),
        ),
        actionItems=[
            ActionItem(
                id="act-1",
                task="Send pricing proposal",
                owner="Sales Rep",
                deadline="tomorrow",
                evidenceQuote="I will send pricing tomorrow",
                timestamp="00:40",
                seconds=40,
                confidence=95,
            )
        ],
        transcript=[
            TranscriptSegment(
                id="t-1",
                speaker="Sales Rep",
                isRep=True,
                timestamp="00:05",
                seconds=5,
                text="Hello, welcome!",
            ),
            TranscriptSegment(
                id="t-2",
                speaker="Customer",
                isRep=False,
                timestamp="00:15",
                seconds=15,
                text="Thanks, let us discuss pricing.",
            ),
        ],
        configUsed=AnalysisConfigInput(),
    )


def test_sql_analytics_cursor_pagination_and_cache_dedupe():
    auth_rate_limiter.reset()
    client = TestClient(main.app)
    org_id = None
    try:
        r = client.post(
            "/api/auth/register",
            json={
                "email": f"scale_{uuid.uuid4().hex[:8]}@example.com",
                "password": "password123",
                "fullName": "Scale Tester",
                "workspaceName": "Scale Corp",
            },
        )
        assert r.status_code == 200
        org_id = r.json()["orgId"]

        # Persist 5 reports (3 GREEN, 2 RED) + duplicate Tier-2 cache_key check
        for i in range(5):
            rating = "RED" if i in (1, 3) else "GREEN"
            rep = _make_sample_report(f"call_{i}.m4a", rating=rating)
            cid = persist_report_to_db(rep, f"hash_{i}", None, org_id=org_id, cache_key=f"ck_{i}")
            assert cid
            # Re-persisting identical cache_key must NOT create a duplicate audit row
            cid_dup = persist_report_to_db(rep, f"hash_{i}", None, org_id=org_id, cache_key=f"ck_{i}")
            assert cid_dup == cid

        # Verify cursor pagination on /api/history
        all_ids = []
        cursor = None
        pages = 0
        while True:
            url = "/api/history?limit=2" + (f"&cursor={cursor}" if cursor else "")
            res = client.get(url)
            assert res.status_code == 200
            body = res.json()
            pages += 1
            for item in body["items"]:
                assert item["turnsCount"] == 2
                assert item["commitmentsCount"] == 1
                all_ids.append(item["id"])
            if not body["hasMore"]:
                break
            cursor = body["nextCursor"]
            assert cursor is not None

        assert len(all_ids) == 5
        assert len(set(all_ids)) == 5
        assert pages == 3

        # Verify cursor pagination on /api/commitments
        res_c1 = client.get("/api/commitments?limit=3")
        assert res_c1.status_code == 200
        c1 = res_c1.json()
        assert len(c1["items"]) == 3 and c1["hasMore"] is True
        res_c2 = client.get(f"/api/commitments?limit=3&cursor={c1['nextCursor']}")
        assert res_c2.status_code == 200
        c2 = res_c2.json()
        assert len(c2["items"]) == 2 and c2["hasMore"] is False

        # Verify SQL analytics aggregation matches exact counts
        res_an = client.get("/api/analytics/overview")
        assert res_an.status_code == 200
        an = res_an.json()
        assert an["totalCalls"] == 5
        assert an["redFlagCount"] == 2
        assert an["greenFlagCount"] == 3
        assert an["totalCommitments"] == 5
    finally:
        if org_id:
            _cleanup_org(org_id)


def test_scoped_db_cache_ttl_and_idempotency_and_ratelimit():
    org_a = f"orgA_{uuid.uuid4().hex[:8]}"
    org_b = f"orgB_{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        db.add(OrganizationModel(id=org_a, name="Org A", daily_token_limit=50000))
        db.add(OrganizationModel(id=org_b, name="Org B", daily_token_limit=50000))
        db.commit()

        save_audio_base_cache("abc123", {"transcript": [{"text": "hello"}], "duration": "00:10"}, org_id=org_a)
        assert get_audio_base_cache("abc123", org_id=org_a) is not None
        # Tenant B must NEVER hit Tenant A's cache!
        assert get_audio_base_cache("abc123", org_id=org_b) is None

        # Force expire and confirm cache returns None
        entry = db.query(CacheEntryModel).filter(CacheEntryModel.org_id == org_a).first()
        entry.expires_at = utcnow_naive() - timedelta(minutes=5)
        db.commit()
        assert get_audio_base_cache("abc123", org_id=org_a) is None

        # Idempotency check
        assert reserve_idempotency(org_a, "POST", "/api/analyze/async", "k-1") is None
        complete_idempotency(org_a, "POST", "/api/analyze/async", "k-1", {"jobId": "j-99", "status": "QUEUED", "cached": False})
        replay = reserve_idempotency(org_a, "POST", "/api/analyze/async", "k-1")
        assert replay["jobId"] == "j-99"

        # Rate limiter check
        lim = TokenBucketRateLimiter(capacity=2, refill_per_sec=0.01)
        assert lim.allow("ip1")[0] is True
        assert lim.allow("ip1")[0] is True
        allowed, _, retry_after = lim.allow("ip1")
        assert allowed is False and retry_after >= 1
    finally:
        db.close()
        _cleanup_org(org_a)
        _cleanup_org(org_b)


def test_ai_gateway_retry_circuit_breaker_and_groq_whisper_timestamps(monkeypatch):
    # 1. Transient 503 retries and succeeds; 401 fails immediately without retrying
    attempts = {"count": 0}

    def flaky():
        attempts["count"] += 1
        if attempts["count"] < 3:
            err = RuntimeError("503 Service Unavailable")
            err.status_code = 503
            raise err
        return "ok"

    assert execute_with_retry_jitter(flaky, max_attempts=3, base_delay=0.01, cap_delay=0.02) == "ok"
    assert attempts["count"] == 3

    auth_attempts = {"count": 0}

    def bad_key():
        auth_attempts["count"] += 1
        err = RuntimeError("401 Unauthorized")
        err.status_code = 401
        raise err

    try:
        execute_with_retry_jitter(bad_key, max_attempts=3, base_delay=0.01)
        assert False, "Should have raised"
    except RuntimeError:
        assert auth_attempts["count"] == 1

    # 2. Circuit breaker opens after 5 failures
    cb = CircuitBreaker("test_prov", failure_threshold=5, window_sec=30, cooldown_sec=60)
    for _ in range(5):
        try:
            cb.call(lambda: (_ for _ in ()).throw(RuntimeError("503 down")))
        except RuntimeError:
            pass
    assert cb.state() == "OPEN"
    try:
        cb.call(lambda: "never")
        assert False, "Expected CircuitOpenError"
    except CircuitOpenError:
        pass

    # 3. Repaired Groq fallback preserves real Whisper timestamps & removes grocery prompt bias
    captured = {}

    class FakeTranscriptions:
        def create(self, **kwargs):
            captured["whisper_prompt"] = kwargs.get("prompt", "")
            return SimpleNamespace(
                text="Hello pricing",
                segments=[
                    {"start": 12.4, "end": 16.0, "text": "Let us discuss enterprise pricing."},
                    {"start": 75.2, "end": 80.0, "text": "I will send the quote tomorrow."},
                ],
            )

    class FakeCompletions:
        def create(self, **kwargs):
            captured["llm_user_prompt"] = kwargs["messages"][1]["content"]
            return SimpleNamespace(
                choices=[
                    SimpleNamespace(
                        message=SimpleNamespace(
                            content=json.dumps({
                                "duration": "01:20",
                                "tone": {
                                    "rating": "GREEN",
                                    "headline": "Helpful rep",
                                    "explanation": "Good",
                                    "confidenceScore": 92,
                                    "sentimentBreakdown": {
                                        "repProfessionalism": 92,
                                        "repEmpathy": 88,
                                        "repPatience": 90,
                                        "customerFrustration": 15,
                                    },
                                    "evidenceQuotes": [],
                                },
                                "actionItems": [],
                                "transcript": [
                                    {
                                        "speaker": "Sales Rep",
                                        "isRep": True,
                                        "timestamp": "00:12",
                                        "seconds": 12,
                                        "text": "Let us discuss enterprise pricing.",
                                    }
                                ],
                                "callMetadata": {
                                    "detectedCategory": "B2B Sales & Demo",
                                    "categoryConfidence": 95,
                                    "domainSummary": "Pricing call",
                                    "greetingObserved": True,
                                    "politeLanguageObserved": True,
                                    "professionalClosingObserved": True,
                                    "etiquetteNotes": ["Polite"],
                                },
                            })
                        )
                    )
                ],
                usage=SimpleNamespace(prompt_tokens=150, completion_tokens=80),
            )

    class FakeGroq:
        def __init__(self, api_key):
            self.audio = SimpleNamespace(transcriptions=FakeTranscriptions())
            self.chat = SimpleNamespace(completions=FakeCompletions())

    monkeypatch.setenv("GROQ_API_KEY", "gsk_test_fake")
    monkeypatch.setitem(sys.modules, "groq", SimpleNamespace(Groq=FakeGroq))
    audio_service.groq_circuit.reset()

    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=".m4a") as tf:
        tf.write(b"\x00\x00\x00\x20ftypM4A " + b"\x00" * 512)
        tpath = tf.name

    org_id = f"groqOrg_{uuid.uuid4().hex[:8]}"
    db = SessionLocal()
    try:
        db.add(OrganizationModel(id=org_id, name="Groq Test Org", daily_token_limit=500000))
        db.commit()
        rep = audio_service._call_groq(
            tpath,
            "saas.m4a",
            "0.01 MB",
            AnalysisConfigInput(presetName="B2B SaaS Sales"),
            "system",
            org_id=org_id,
        )
        assert "khajoor" not in captured["whisper_prompt"].lower()
        assert "[00:12]" in captured["llm_user_prompt"]
        assert "[01:15]" in captured["llm_user_prompt"]
        assert "<UNTRUSTED_TRANSCRIPT>" in captured["llm_user_prompt"]
        assert rep.transcript[0].seconds == 12
    finally:
        db.close()
        if os.path.isfile(tpath):
            os.remove(tpath)
        _cleanup_org(org_id)


def test_multitenant_isolation_rbac_and_daily_token_quota_renewal():
    auth_rate_limiter.reset()
    analysis_rate_limiter.reset()

    client_a = TestClient(main.app)
    client_b = TestClient(main.app)
    client_member = TestClient(main.app)
    org_a = None
    org_b = None

    try:
        ra = client_a.post(
            "/api/auth/register",
            json={
                "email": f"admin_a_{uuid.uuid4().hex[:8]}@example.com",
                "password": "password123",
                "fullName": "Admin A",
                "workspaceName": "Org Alpha",
            },
        )
        assert ra.status_code == 200
        org_a = ra.json()["orgId"]

        rb = client_b.post(
            "/api/auth/register",
            json={
                "email": f"admin_b_{uuid.uuid4().hex[:8]}@example.com",
                "password": "password123",
                "fullName": "Admin B",
                "workspaceName": "Org Beta",
            },
        )
        assert rb.status_code == 200
        org_b = rb.json()["orgId"]

        # Create MEMBER user inside Org A
        db = SessionLocal()
        member_email = f"member_a_{uuid.uuid4().hex[:8]}@example.com"
        db.add(
            UserModel(
                id=str(uuid.uuid4()),
                email=member_email,
                password_hash=hash_password("password123"),
                full_name="Member A",
                org_id=org_a,
                role="MEMBER",
            )
        )
        # Create asset + audit owned by Org A
        asset_id = str(uuid.uuid4())
        db.add(
            AudioAssetModel(
                id=asset_id,
                org_id=org_a,
                sha256="deadbeef" * 3,
                original_filename="secret_a.m4a",
                mime_type="audio/mp4",
                detected_format="audio/mp4",
                size_bytes=1024,
                duration_seconds=10.0,
                storage_key=f"{asset_id}.m4a",
            )
        )
        db.commit()
        db.close()

        call_id_a = persist_report_to_db(_make_sample_report("secret_a.m4a"), "deadbeef" * 3, asset_id, org_id=org_a)

        # Org B cannot view Org A's audit or list it
        assert client_b.get(f"/api/history/{call_id_a}").status_code == 404
        assert len(client_b.get("/api/history").json()["items"]) == 0

        # Member A login & RBAC checks
        rm = client_member.post("/api/auth/login", json={"email": member_email, "password": "password123"})
        assert rm.status_code == 200
        assert client_member.delete("/api/cache").status_code == 403
        assert client_member.patch("/api/org/token-quota", json={"dailyLimit": 5000}).status_code == 403

        # Admin A sets daily limit to 1000
        r_upd = client_a.patch("/api/org/token-quota", json={"dailyLimit": 1000})
        assert r_upd.status_code == 200
        assert r_upd.json()["dailyLimit"] == 1000

        # Yesterday's 950 tokens do NOT count toward today (proving UTC midnight renewal!)
        db = SessionLocal()
        db.add(
            TokenUsageLedgerModel(
                org_id=org_a,
                provider="gemini",
                model="gemini-flash-latest",
                stage="single_pass",
                input_tokens=800,
                output_tokens=150,
                total_tokens=950,
                estimated_cost_usd=0.0002,
                created_at=utcnow_naive() - timedelta(days=1),
            )
        )
        db.commit()
        db.close()

        q_fresh = client_a.get("/api/org/token-quota").json()
        assert q_fresh["usedToday"] == 0
        assert q_fresh["remainingToday"] == 1000
        assert q_fresh["isExhausted"] is False

        # Exhaust today's 1000-token quota for Org A
        db = SessionLocal()
        db.add(
            TokenUsageLedgerModel(
                org_id=org_a,
                provider="gemini",
                model="gemini-flash-latest",
                stage="single_pass",
                input_tokens=800,
                output_tokens=200,
                total_tokens=1000,
                estimated_cost_usd=0.00024,
                created_at=utcnow_naive(),
            )
        )
        db.commit()
        db.close()

        q_exhausted = client_a.get("/api/org/token-quota").json()
        assert q_exhausted["usedToday"] == 1000
        assert q_exhausted["remainingToday"] == 0
        assert q_exhausted["isExhausted"] is True

        # New analysis for Org A is blocked with 429 DAILY_QUOTA_EXCEEDED + Retry-After
        r_blocked = client_a.post(
            "/api/analyze/async",
            json={"assetId": asset_id, "config": AnalysisConfigInput().model_dump()},
        )
        assert r_blocked.status_code == 429
        assert r_blocked.json()["code"] == "DAILY_QUOTA_EXCEEDED"
        assert int(r_blocked.headers["Retry-After"]) >= 1

        # Org B's quota remains completely unaffected
        q_b = client_b.get("/api/org/token-quota").json()
        assert q_b["usedToday"] == 0
        assert q_b["isExhausted"] is False
    finally:
        if org_a:
            _cleanup_org(org_a)
        if org_b:
            _cleanup_org(org_b)
