"""
Retry: re-attempt episodes that failed during the daily ingestion pipeline.

Runs independently of the main ingestion cron (daily_pipeline.yml), on its
own schedule (see .github/workflows/retry_failed_episodes.yml), so a fresh
LLM provider instance — fresh per-provider "dead" state — gets another shot
at episodes that failed when quota was exhausted. daily_pipeline.yml's own
in-band retry (get_episodes_for_retry(), max_retries=3) already re-attempts
failed episodes on its next scheduled run, but it reuses whatever waterfall
instance that particular run builds — if quota's still gone when that run
starts, it fails the same way again. A dedicated job with its own schedule
and its own fresh instance is what actually recovers once quota comes back,
without waiting on the next ingestion run's luck.

Reuses _process_episode() from worker.jobs.pipeline, so it automatically
gets: the transcript-cache check (skips re-fetching captions / re-downloading
and re-transcribing audio when a transcript is already saved — the common
case, since most retry-worthy failures happen at the LLM step, after the
transcript was already stored), the _LLM_LOCK serialization, and the
all_providers_dead short-circuit (stops immediately once this run's fresh
waterfall exhausts itself again, instead of grinding through the rest of the
batch on calls already known to fail).

Run locally:
    python -m worker.jobs.retry_failed_episodes [--limit 20]

Or trigger via GitHub Actions:
    Actions → Retry Failed Episodes → Run workflow
"""

import argparse
from datetime import datetime, timedelta, timezone

from worker.core.registry import get_llm_provider, get_storage_provider
from worker.jobs.pipeline import _get_source_provider, _process_episode

DEFAULT_LIMIT = 20
# Dedicated recovery job — give failed episodes more chances here than the
# in-band pipeline retry allows (max_retries=3), since this job exists
# specifically to keep trying once quota is more likely to have recovered.
MAX_RETRIES = 10


def retry_failed_episodes(limit: int = DEFAULT_LIMIT) -> dict:
    storage = get_storage_provider()

    try:
        llm = get_llm_provider()
    except ValueError as e:
        print(f"[RetryFailed] cannot start — {e}")
        return {"attempted": 0, "succeeded": 0, "failed": 0, "deferred": False, "error": str(e)}

    pairs = storage.get_episodes_for_retry(max_retries=MAX_RETRIES)
    if not pairs:
        print("[RetryFailed] no failed episodes due for retry — nothing to do")
        return {"attempted": 0, "succeeded": 0, "failed": 0, "deferred": False, "remaining": 0}

    batch = pairs[:limit]
    print(f"[RetryFailed] {len(pairs)} failed episode(s) due for retry — attempting {len(batch)} this run")

    date_str = datetime.now().strftime("%Y-%m-%d")
    succeeded = failed = 0
    deferred = False
    attempted = 0

    for episode, source in batch:
        provider = _get_source_provider(source)
        status, error_msg = _process_episode(storage, llm, source, provider, episode, date_str)
        if status == "deferred":
            deferred = True
            print("[RetryFailed] all providers exhausted again — stopping this run")
            break
        attempted += 1
        if status == "insights":
            succeeded += 1
            print(f"[RetryFailed] ✓ {episode.id[:8]} ({source.name})")
        else:
            failed += 1
            if error_msg:
                print(error_msg)
            retry_after = datetime.now(timezone.utc) + timedelta(hours=4)
            try:
                storage.increment_episode_retry(episode.id, source.id, retry_after, error_msg)
            except Exception as e:
                print(f"[RetryFailed] [warn] could not update retry state for {episode.id[:8]}: {e}")

    remaining = max(0, len(pairs) - attempted)
    summary = f"{succeeded} succeeded, {failed} failed, {remaining} remaining"
    if deferred:
        summary += " (stopped early — all providers exhausted)"
    print(f"[RetryFailed] done — {summary}")
    return {"attempted": attempted, "succeeded": succeeded, "failed": failed, "deferred": deferred, "remaining": remaining}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Max failed episodes to retry this run")
    args = parser.parse_args()
    retry_failed_episodes(limit=args.limit)
