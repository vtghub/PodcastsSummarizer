"""
One-time backfill: discover and save platform_links for all sources
that still have an empty platform_links column.

Run locally:
    python -m worker.jobs.backfill_platform_links
    python -m worker.jobs.backfill_platform_links --source-id <id>

Or trigger via GitHub Actions:
    Actions → Backfill Platform Links → Run workflow
"""

import argparse

from worker.core.registry import get_storage_provider
from worker.providers.source.rss_source import RSSSourceProvider


def backfill_platform_links(source_id: str | None = None) -> None:
    storage = get_storage_provider()
    # Include disabled sources so every source gets links, not just active ones
    sources = storage.get_sources(enabled_only=False)
    rss = RSSSourceProvider()

    if source_id:
        to_process = [s for s in sources if s.id == source_id]
        if not to_process:
            print(f"[Backfill] Source '{source_id}' not found.")
            return
        print(f"[Backfill] Targeting single source: {to_process[0].name}")
    else:
        # Process sources that are missing links entirely OR missing the youtube key
        to_process = [s for s in sources if not s.platform_links or "youtube" not in s.platform_links]
        already = len(sources) - len(to_process)
        print(f"[Backfill] {len(sources)} total sources — {already} already complete, {len(to_process)} to process")

    for source in to_process:
        print(f"[{source.name}] discovering...")
        try:
            discovered = rss.fetch_platform_links(source)
            # Merge new links with existing ones; only save if something changed
            existing = source.platform_links or {}
            merged = {**existing, **discovered}
            if merged != existing:
                storage.update_source_platform_links(source.id, merged)
                new_keys = [k for k in merged if k not in existing]
                print(f"[{source.name}] saved new: {new_keys} | full: {list(merged.keys())}")
            else:
                print(f"[{source.name}] no new links found")
        except Exception as e:
            print(f"[{source.name}] ERROR: {e}")

    print("[Backfill] Done.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", default=None, help="Backfill a single source by ID")
    args = parser.parse_args()
    backfill_platform_links(source_id=args.source_id)
