"""
Backfill: re-run every existing insight through the current LLM waterfall.

Reuses each insight's already-saved transcript (no audio re-download, no
Whisper re-run) — just re-extracts with the chunked map-reduce + multi-
provider waterfall introduced after these insights were first generated,
then overwrites the insight in place (same id) so bookmarks/comments/
reactions on it keep working.

This is a resumable background job, not a one-shot script: each invocation
processes one bounded batch (default 30 insights) and exits. Progress is
tracked in Supabase (backfill_jobs / backfill_failures — migration 020) via
a (created_at, id) cursor, so repeated invocations — whether triggered
manually or by a scheduled GitHub Actions run — pick up exactly where the
last one left off. A full backfill is expected to span multiple runs (and
likely multiple days, given free-tier rate limits), not complete in one call.

Always uses the waterfall (scope='pipeline'), regardless of the worker's
own LLM_PROVIDER setting — the whole point of this job is exercising the
new plug-in waterfall architecture.

Run locally:
    python -m worker.jobs.backfill_insights [--batch-size 30]
    python -m worker.jobs.backfill_insights --retry-failed

Or trigger via GitHub Actions:
    Actions → Backfill Insights → Run workflow
"""

import argparse

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.core.registry import get_storage_provider

JOB_TYPE = "insight_reextraction"


def _reextract(llm: LLMProvider, episode: Episode, transcript: Transcript, insight: Insight) -> Insight:
    """Re-run extraction against an already-saved transcript, preserving the
    original insight's identity/placement (id, episode, source, domain, date)."""
    new_insight = llm.extract_insights(episode, transcript, insight.domain)
    new_insight.id = insight.id
    new_insight.episode_id = insight.episode_id
    new_insight.source_id = insight.source_id
    new_insight.domain = insight.domain
    new_insight.date = insight.date
    return new_insight


def _get_llm() -> LLMProvider | None:
    try:
        from worker.providers.llm.waterfall_llm import WaterfallLLMProvider
        return WaterfallLLMProvider(scope="pipeline")
    except ValueError as e:
        print(f"[Backfill] cannot start — {e}")
        return None


def run_backfill(batch_size: int = 30) -> dict:
    storage = get_storage_provider()

    job = storage.get_active_backfill_job(JOB_TYPE)
    if job is None:
        total = storage.count_insights()
        if total == 0:
            print("[Backfill] no insights exist yet — nothing to do")
            return {"completed": True, "processed": 0}
        job_id = storage.create_backfill_job(JOB_TYPE, total_items=total, batch_size=batch_size)
        print(f"[Backfill] started new job {job_id} — {total} insight(s) to reprocess")
    else:
        job_id = job["id"]
        print(f"[Backfill] resuming job {job_id} — {job['processed_items']}/{job['total_items']} done so far")

    batch = storage.get_next_backfill_batch(job_id, batch_size)
    if not batch:
        storage.complete_backfill_job(job_id)
        print(f"[Backfill] job {job_id} complete — no more insights to process")
        return {"job_id": job_id, "processed": 0, "completed": True}

    llm = _get_llm()
    if llm is None:
        return {"job_id": job_id, "processed": 0, "completed": False, "error": "no LLM provider configured"}

    succeeded = failed = 0
    for insight in batch:
        try:
            episode = storage.get_episode(insight.episode_id)
            transcript = storage.get_transcript(insight.episode_id)
            if not episode:
                raise ValueError("episode not found")
            if not transcript:
                raise ValueError("no saved transcript for this episode")

            new_insight = _reextract(llm, episode, transcript, insight)
            storage.save_insight(new_insight)
            storage.advance_backfill_cursor(job_id, insight, success=True)
            succeeded += 1
            print(f"[Backfill] ✓ {insight.id} ({insight.date}, {insight.domain})")
        except Exception as e:
            storage.advance_backfill_cursor(job_id, insight, success=False, error_msg=str(e)[:500])
            failed += 1
            print(f"[Backfill] ✗ {insight.id}: {e}")

    print(f"[Backfill] batch done — {succeeded} succeeded, {failed} failed ({len(batch)} total)")
    return {"job_id": job_id, "processed": len(batch), "succeeded": succeeded, "failed": failed, "completed": False}


def retry_failed_items() -> dict:
    """
    Re-attempt every currently-logged failure for the most recent backfill
    job (regardless of whether that job has since completed) — typically run
    after a fix that should resolve them (e.g. the parse_json_response
    json_repair fallback). Does not touch the job's resume cursor; this is
    out-of-band from normal batch progress.
    """
    storage = get_storage_provider()

    job = storage.get_latest_backfill_job(JOB_TYPE)
    if job is None:
        print("[Backfill] no backfill job found — nothing to retry")
        return {"retried": 0}

    failures = storage.get_backfill_failures(job["id"])
    if not failures:
        print(f"[Backfill] job {job['id']} has no logged failures — nothing to retry")
        return {"retried": 0}

    llm = _get_llm()
    if llm is None:
        return {"retried": 0, "error": "no LLM provider configured"}

    print(f"[Backfill] retrying {len(failures)} failed item(s) from job {job['id']}")

    succeeded = failed = 0
    for f in failures:
        insight_id, episode_id = f["insight_id"], f["episode_id"]
        try:
            insight = storage.get_insight(insight_id)
            if not insight:
                raise ValueError("insight no longer exists")
            episode = storage.get_episode(episode_id)
            transcript = storage.get_transcript(episode_id)
            if not episode:
                raise ValueError("episode not found")
            if not transcript:
                raise ValueError("no saved transcript for this episode")

            new_insight = _reextract(llm, episode, transcript, insight)
            storage.save_insight(new_insight)
            storage.retry_backfill_failure(job["id"], insight_id, success=True)
            succeeded += 1
            print(f"[Backfill] retry ✓ {insight_id}")
        except Exception as e:
            storage.retry_backfill_failure(job["id"], insight_id, success=False, error_msg=str(e)[:500])
            failed += 1
            print(f"[Backfill] retry ✗ {insight_id}: {e}")

    print(f"[Backfill] retry done — {succeeded} succeeded, {failed} still failing")
    return {"retried": len(failures), "succeeded": succeeded, "failed": failed}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=30, help="Insights to reprocess in this run")
    parser.add_argument("--retry-failed", action="store_true", help="Retry previously-failed items instead of processing a new batch")
    args = parser.parse_args()
    if args.retry_failed:
        retry_failed_items()
    else:
        run_backfill(batch_size=args.batch_size)
