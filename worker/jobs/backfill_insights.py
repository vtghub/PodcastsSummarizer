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

Or trigger via GitHub Actions:
    Actions → Backfill Insights → Run workflow
"""

import argparse

from worker.core.registry import get_storage_provider

JOB_TYPE = "insight_reextraction"


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

    try:
        from worker.providers.llm.waterfall_llm import WaterfallLLMProvider
        llm = WaterfallLLMProvider(scope="pipeline")
    except ValueError as e:
        print(f"[Backfill] cannot start batch — {e}")
        return {"job_id": job_id, "processed": 0, "completed": False, "error": str(e)}

    succeeded = failed = 0
    for insight in batch:
        try:
            episode = storage.get_episode(insight.episode_id)
            transcript = storage.get_transcript(insight.episode_id)
            if not episode:
                raise ValueError("episode not found")
            if not transcript:
                raise ValueError("no saved transcript for this episode")

            new_insight = llm.extract_insights(episode, transcript, insight.domain)
            # Re-extraction may legitimately change summary/key_points/etc,
            # but identity and placement (which episode, which date it
            # appears under) must stay exactly as they were.
            new_insight.id = insight.id
            new_insight.episode_id = insight.episode_id
            new_insight.source_id = insight.source_id
            new_insight.domain = insight.domain
            new_insight.date = insight.date

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


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=30, help="Insights to reprocess in this run")
    args = parser.parse_args()
    run_backfill(batch_size=args.batch_size)
