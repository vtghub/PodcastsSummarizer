"""
One-time backfill: discover and save platform_links for all sources
that still have an empty platform_links column.

Run locally:
    python -m worker.jobs.backfill_platform_links

Or trigger via GitHub Actions:
    Actions → Backfill Platform Links → Run workflow
"""

from worker.core.registry import get_storage_provider
from worker.providers.source.rss_source import RSSSourceProvider


def backfill_platform_links() -> None:
    storage = get_storage_provider()
    # Include disabled sources so every source gets links, not just active ones
    sources = storage.get_sources(enabled_only=False)
    rss = RSSSourceProvider()

    empty = [s for s in sources if not s.platform_links]
    already = len(sources) - len(empty)

    print(f"[Backfill] {len(sources)} total sources — {already} already have links, {len(empty)} to process")

    for source in empty:
        print(f"[{source.name}] discovering...")
        try:
            links = rss.fetch_platform_links(source)
            if links:
                storage.update_source_platform_links(source.id, links)
                print(f"[{source.name}] saved: {list(links.keys())}")
            else:
                print(f"[{source.name}] no links found")
        except Exception as e:
            print(f"[{source.name}] ERROR: {e}")

    print("[Backfill] Done.")


if __name__ == "__main__":
    backfill_platform_links()
