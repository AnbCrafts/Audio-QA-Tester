import os
import shutil
import asyncio
from typing import Dict, Any, List
from database import SessionLocal
from models import (
    AnalysisJobModel,
    AudioAssetModel,
    AudioChunkResultModel,
    CallAuditModel,
    TranscriptSegmentModel,
    CommitmentModel,
)
from schemas import AnalysisConfigInput, AnalysisReport
from storage_service import storage_provider, TMP_CHUNKS_DIR
from audio_chunker import (
    CHUNKING_THRESHOLD_SECONDS,
    AudioChunkSpec,
    probe_audio_duration,
    detect_silences,
    plan_split_windows,
    extract_audio_chunk,
    format_timestamp,
)
from audio_service import (
    analyze_call_with_ai,
    reanalyze_from_transcript,
    transcribe_audio_chunk_with_gemini,
    merge_chunk_transcripts,
    reduce_merged_transcript_to_report,
)
from cache_service import (
    get_cached_report,
    save_cached_report,
    get_audio_base_cache,
    save_audio_base_cache,
)


def _update_job(
    job_id: str,
    *,
    status: str = None,
    stage_message: str = None,
    progress_pct: int = None,
    total_chunks: int = None,
    completed_chunks: int = None,
    call_id: str = None,
    result_json: dict = None,
    error_message: str = None,
) -> None:
    db = SessionLocal()
    try:
        job = db.query(AnalysisJobModel).filter(AnalysisJobModel.id == job_id).first()
        if not job:
            return
        if status is not None:
            job.status = status
        if stage_message is not None:
            job.stage_message = stage_message
        if progress_pct is not None:
            job.progress_pct = progress_pct
        if total_chunks is not None:
            job.total_chunks = total_chunks
        if completed_chunks is not None:
            job.completed_chunks = completed_chunks
        if call_id is not None:
            job.call_id = call_id
        if result_json is not None:
            job.result_json = result_json
        if error_message is not None:
            job.error_message = error_message
        db.commit()
    finally:
        db.close()


def persist_report_to_db(report: AnalysisReport, audio_hash: str, asset_id: str = None) -> str:
    """Persists an AnalysisReport and links it to its persistent AudioAsset."""
    db = SessionLocal()
    try:
        raw_score = 4.5
        if report.tone.rating == "RED":
            raw_score = 2.4
        elif report.tone.sentimentBreakdown:
            p = report.tone.sentimentBreakdown.repProfessionalism
            e = report.tone.sentimentBreakdown.repEmpathy
            raw_score = round(((p + e) / 200.0) * 5.0, 1)

        meta = report.callMetadata
        audit = CallAuditModel(
            filename=report.fileName,
            file_size=report.fileSize,
            duration=report.duration,
            overall_score=raw_score,
            tone_rating=report.tone.rating,
            headline=report.tone.headline,
            explanation=report.tone.explanation,
            confidence_score=report.tone.confidenceScore,
            sentiment_breakdown=report.tone.sentimentBreakdown.model_dump() if report.tone.sentimentBreakdown else {},
            category=meta.detectedCategory if meta and meta.detectedCategory else "General Call",
            category_confidence=meta.categoryConfidence if meta else 90,
            domain_summary=(meta.domainSummary or "") if meta else "",
            greeting_observed=meta.greetingObserved if meta else True,
            polite_language_observed=meta.politeLanguageObserved if meta else True,
            professional_closing_observed=meta.professionalClosingObserved if meta else True,
            etiquette_notes=(meta.etiquetteNotes or []) if meta else [],
            evidence_quotes=[eq.model_dump() for eq in report.tone.evidenceQuotes],
            audio_hash=audio_hash,
            asset_id=asset_id,
        )
        db.add(audit)
        db.flush()

        for seg in report.transcript:
            db.add(
                TranscriptSegmentModel(
                    call_id=audit.id,
                    speaker=seg.speaker,
                    is_rep=seg.isRep,
                    timestamp=seg.timestamp,
                    seconds=seg.seconds,
                    text=seg.text,
                    is_flagged_evidence=bool(seg.isFlaggedEvidence),
                )
            )

        for act in report.actionItems:
            act.callId = audit.id
            db.add(
                CommitmentModel(
                    call_id=audit.id,
                    task=act.task,
                    owner=act.owner,
                    deadline=act.deadline,
                    evidence_quote=act.evidenceQuote,
                    timestamp=act.timestamp or "00:00",
                    seconds=act.seconds or 0,
                    confidence=act.confidence,
                    status=act.status or "PENDING",
                )
            )

        db.commit()
        db.refresh(audit)
        report.callId = audit.id
        report.assetId = asset_id
        if asset_id:
            report.audioUrl = f"/api/assets/{asset_id}/stream"
        return audit.id
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


async def execute_analysis_job(job_id: str) -> None:
    """
    Background worker that orchestrates:
      1. Tier-2 & Tier-1 cache checks
      2. Short (<12 min) single-pass multimodal OR Lengthy (>=12 min) Silence-Aware Map-Reduce
      3. Per-chunk persistence for partial failure resumption
      4. Final DB + Cache persistence and temp chunk cleanup
    """
    db = SessionLocal()
    try:
        job = db.query(AnalysisJobModel).filter(AnalysisJobModel.id == job_id).first()
        if not job:
            return
        asset = db.query(AudioAssetModel).filter(AudioAssetModel.id == job.asset_id).first()
        if not asset:
            _update_job(job_id, status="FAILED", stage_message="Audio asset not found.", error_message="AudioAsset missing")
            return
        config = AnalysisConfigInput(**(job.config_json or {}))
        audio_hash = job.audio_hash
        config_hash = job.config_hash
        cache_key = f"{audio_hash}_{config_hash}"
        file_path = storage_provider.get_local_path(asset.storage_key)
        file_size_mb = f"{asset.size_bytes / (1024 * 1024):.2f} MB"
        filename = asset.original_filename
        duration_sec = float(asset.duration_seconds or 0.0)
        asset_id = asset.id
    finally:
        db.close()

    job_tmp_dir = os.path.join(TMP_CHUNKS_DIR, f"job_{job_id}")

    try:
        # 1. Tier-2 Cache Check
        cached_data = get_cached_report(cache_key)
        if cached_data and cached_data.get("transcript"):
            cached_data["cached"] = True
            cached_data["assetId"] = asset_id
            cached_data["audioUrl"] = f"/api/assets/{asset_id}/stream"
            report = AnalysisReport(**cached_data)
            call_id = await asyncio.to_thread(persist_report_to_db, report, audio_hash, asset_id)
            _update_job(
                job_id,
                status="COMPLETED",
                stage_message="Loaded verified report from Tier-2 cache.",
                progress_pct=100,
                call_id=call_id,
                result_json=report.model_dump(),
            )
            return

        # 2. Tier-1 Audio Transcript Cache Check (~300ms fast re-analysis)
        audio_base = get_audio_base_cache(audio_hash)
        if audio_base and audio_base.get("transcript"):
            _update_job(job_id, status="REDUCING", stage_message="Tier-1 transcript hit: re-evaluating against rubric...", progress_pct=70)
            report = await asyncio.to_thread(
                reanalyze_from_transcript,
                audio_base=audio_base,
                filename=filename,
                file_size_str=file_size_mb,
                config=config,
            )
            report.assetId = asset_id
            report.audioUrl = f"/api/assets/{asset_id}/stream"
            save_cached_report(cache_key, report.model_dump())
            call_id = await asyncio.to_thread(persist_report_to_db, report, audio_hash, asset_id)
            _update_job(
                job_id,
                status="COMPLETED",
                stage_message="Re-evaluation completed.",
                progress_pct=100,
                call_id=call_id,
                result_json=report.model_dump(),
            )
            return

        # Probe duration if missing
        if duration_sec <= 0:
            duration_sec = await asyncio.to_thread(probe_audio_duration, file_path)

        # 3. Short Audio (< 12 min) -> Single-Pass Multimodal
        if duration_sec < CHUNKING_THRESHOLD_SECONDS:
            _update_job(
                job_id,
                status="TRANSCRIBING",
                stage_message="Uploading audio to AI engine for multimodal analysis...",
                progress_pct=35,
                total_chunks=1,
                completed_chunks=0,
            )
            report = await asyncio.to_thread(
                analyze_call_with_ai,
                file_path=file_path,
                filename=filename,
                file_size_str=file_size_mb,
                config=config,
            )
        else:
            # 4. Lengthy Audio (>= 12 min, e.g. 1-Hour+) -> Silence-Aware Map-Reduce
            _update_job(job_id, status="SPLITTING", stage_message="Scanning natural pauses & splitting lengthy audio...", progress_pct=8)
            silences = await asyncio.to_thread(detect_silences, file_path)
            windows = plan_split_windows(duration_sec, silences)
            total_chunks = len(windows)
            os.makedirs(job_tmp_dir, exist_ok=True)

            _update_job(
                job_id,
                status="TRANSCRIBING",
                stage_message=f"Processing {total_chunks} audio segments (10-min chunks)...",
                progress_pct=15,
                total_chunks=total_chunks,
                completed_chunks=0,
            )

            # Check existing persisted chunk results for this audio_hash (resumable!)
            db = SessionLocal()
            try:
                existing_rows = (
                    db.query(AudioChunkResultModel)
                    .filter(
                        AudioChunkResultModel.audio_hash == audio_hash,
                        AudioChunkResultModel.status == "COMPLETED",
                    )
                    .all()
                )
                cached_chunks_by_idx: Dict[int, AudioChunkResultModel] = {r.chunk_index: r for r in existing_rows}
            finally:
                db.close()

            chunk_records: List[Dict[str, Any]] = []
            speaker_context = ""

            for idx, (start_sec, end_sec) in enumerate(windows):
                if idx in cached_chunks_by_idx:
                    row = cached_chunks_by_idx[idx]
                    segs = row.transcript_json or []
                    notes = row.acoustic_notes or ""
                else:
                    _update_job(
                        job_id,
                        status="TRANSCRIBING",
                        stage_message=f"Transcribing segment {idx + 1} of {total_chunks} ({format_timestamp(start_sec)} - {format_timestamp(end_sec)})...",
                        progress_pct=15 + int((idx / total_chunks) * 65),
                        completed_chunks=idx,
                    )
                    chunk_path = os.path.join(job_tmp_dir, f"chunk_{idx:03d}.m4a")
                    await asyncio.to_thread(extract_audio_chunk, file_path, start_sec, end_sec, chunk_path)
                    spec = AudioChunkSpec(index=idx, start_seconds=start_sec, end_seconds=end_sec, file_path=chunk_path)
                    try:
                        segs, notes = await asyncio.to_thread(
                            transcribe_audio_chunk_with_gemini,
                            spec,
                            config,
                            speaker_context,
                        )
                    finally:
                        if os.path.isfile(chunk_path):
                            try:
                                os.remove(chunk_path)
                            except OSError:
                                pass

                    # Persist completed chunk immediately for fault-tolerant resumption
                    db = SessionLocal()
                    try:
                        db.add(
                            AudioChunkResultModel(
                                job_id=job_id,
                                audio_hash=audio_hash,
                                chunk_index=idx,
                                start_seconds=start_sec,
                                end_seconds=end_sec,
                                transcript_json=segs,
                                acoustic_notes=notes,
                                status="COMPLETED",
                            )
                        )
                        db.commit()
                    finally:
                        db.close()

                chunk_records.append({
                    "chunk_index": idx,
                    "start_seconds": start_sec,
                    "end_seconds": end_sec,
                    "transcript": segs,
                    "acoustic_notes": notes,
                })

                # Build 2-turn speaker continuity context for the next chunk
                tail_turns = segs[-2:] if segs else []
                speaker_context = "\n".join(
                    f"{t['speaker']} [{t['timestamp']}]: {t['text']}" for t in tail_turns
                )

                _update_job(
                    job_id,
                    completed_chunks=idx + 1,
                    progress_pct=15 + int(((idx + 1) / total_chunks) * 65),
                )

            _update_job(job_id, status="MERGING", stage_message="Merging chunks & deduplicating boundaries...", progress_pct=85)
            merged_segments, combined_notes = await asyncio.to_thread(merge_chunk_transcripts, chunk_records)

            _update_job(job_id, status="REDUCING", stage_message="Auditing holistic tone, etiquette & commitments...", progress_pct=92)
            duration_str = format_timestamp(duration_sec)
            report = await asyncio.to_thread(
                reduce_merged_transcript_to_report,
                merged_segments,
                combined_notes,
                duration_str,
                filename,
                file_size_mb,
                config,
            )

        report.assetId = asset_id
        report.audioUrl = f"/api/assets/{asset_id}/stream"

        if report.transcript:
            save_audio_base_cache(
                audio_hash,
                {
                    "transcript": [seg.model_dump() for seg in report.transcript],
                    "duration": report.duration,
                    "callMetadata": report.callMetadata.model_dump() if report.callMetadata else None,
                },
            )
            save_cached_report(cache_key, report.model_dump())
            call_id = await asyncio.to_thread(persist_report_to_db, report, audio_hash, asset_id)
        else:
            call_id = report.callId

        _update_job(
            job_id,
            status="COMPLETED",
            stage_message="Analysis completed.",
            progress_pct=100,
            call_id=call_id,
            result_json=report.model_dump(),
        )
    except Exception as exc:
        print(f"[Job Error] {job_id} failed: {exc}")
        _update_job(
            job_id,
            status="FAILED",
            stage_message="Analysis failed.",
            error_message=str(exc)[:500],
        )
    finally:
        if os.path.isdir(job_tmp_dir):
            shutil.rmtree(job_tmp_dir, ignore_errors=True)
