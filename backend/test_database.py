import os
from database import engine, Base, SessionLocal
from models import CallAuditModel, TranscriptSegmentModel, CommitmentModel

def run_db_tests():
    print("[Test] Creating all tables...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Insert test call audit
        print("[Test] Inserting CallAuditModel...")
        test_audit = CallAuditModel(
            filename="demo_call.m4a",
            duration="01:30",
            overall_score=4.8,
            tone_rating="GREEN",
            headline="Professional and courteous sales demo",
            category="B2B SaaS Sales",
            confidence_score=95,
        )
        db.add(test_audit)
        db.flush()
        print(f"[Success] Created CallAudit with ID: {test_audit.id}")

        # 2. Insert transcript segments
        t1 = TranscriptSegmentModel(
            call_id=test_audit.id,
            speaker="Sales Rep",
            is_rep=True,
            timestamp="00:05",
            seconds=5,
            text="Welcome to Acme, how can I help you today?",
        )
        t2 = TranscriptSegmentModel(
            call_id=test_audit.id,
            speaker="Customer",
            is_rep=False,
            timestamp="00:15",
            seconds=15,
            text="Could you email me the security whitepaper?",
        )
        db.add_all([t1, t2])

        # 3. Insert commitment
        c1 = CommitmentModel(
            call_id=test_audit.id,
            task="Email security whitepaper to prospect",
            owner="Sales Rep",
            deadline="by tomorrow morning",
            timestamp="00:20",
            seconds=20,
            status="PENDING",
        )
        db.add(c1)
        db.commit()
        print("[Success] Added transcript turns and commitment successfully.")

        # 4. Verify relations and retrieval
        retrieved = db.query(CallAuditModel).filter(CallAuditModel.id == test_audit.id).first()
        assert retrieved is not None, "Failed to retrieve call"
        assert len(retrieved.transcripts) == 2, f"Expected 2 turns, got {len(retrieved.transcripts)}"
        assert len(retrieved.commitments) == 1, f"Expected 1 commitment, got {len(retrieved.commitments)}"
        print(f"[Success] Verified relations: {len(retrieved.transcripts)} turns, {len(retrieved.commitments)} commitments.")

        # 5. Verify commitment status update
        retrieved_comm = retrieved.commitments[0]
        retrieved_comm.status = "COMPLETED"
        db.commit()
        db.refresh(retrieved_comm)
        assert retrieved_comm.status == "COMPLETED", "Failed to update commitment status"
        print("[Success] Commitment status updated to COMPLETED successfully.")

        # 6. Verify serialization to report dict
        report_dict = retrieved.to_report_dict()
        assert report_dict["callId"] == test_audit.id
        assert len(report_dict["actionItems"]) == 1
        assert report_dict["actionItems"][0]["status"] == "COMPLETED"
        print("[Success] Model serialization to AnalysisReport verified.")

        print("\nALL DATABASE TESTS PASSED SUCCESSFULLY! (100% Verified)")
    finally:
        db.close()

if __name__ == "__main__":
    run_db_tests()
