"""
Backfill published_at for episodes that have a null published_at.

For each source, fetches the RSS feed and matches stored episodes by ID
(MD5 of normalized audio URL) to update their published_at timestamp.

Run locally:
    python -m worker.jobs.backfill_published_at

Or trigger via GitHub Actions:
    Actions → Backfill Episode Published Dates → Run workflow
"""

import argparse
import hashlib
import urllib.parse

import feedparser

from worker.core.registry import get_storage_provider


def backfill_published_at(source_id: str | None = None) -> None:
    storage = get_storage_provider()
    all_sources = storage.get_sources(enabled_only=False)

    if source_id:
        sources = [s for s in all_sources if s.id == source_id]
        if not sources:
            print(f"[Backfill] No source found with id={source_id}")
            return
    else:
        sources = all_sources

    total_updated = 0

    for source in sources:
        print(f"[{source.name}] fetching feed...")
        try:
            feed = feedparser.parse(source.url)
        except Exception as e:
            print(f"[{source.name}] ERROR fetching feed: {e}")
            continue

        updated = 0
        for entry in feed.entries:
            # Find audio URL same way RSSSourceProvider does
            audio_url = _extract_audio_url(entry)
            if not audio_url:
                continue
            audio_url = urllib.parse.unquote(audio_url)
            episode_id = hashlib.md5(audio_url.encode()).hexdigest()

            published_at = _parse_date(entry)
            if not published_at:
                continue

            try:
                rows_updated = storage.update_episode_published_at(episode_id, published_at)
                if rows_updated:
                    updated += rows_updated
            except AttributeError:
                print(f"[{source.name}] storage provider does not support update_episode_published_at — skipping")
                break
            except Exception as e:
                print(f"[{source.name}] ERROR updating {episode_id}: {e}")

        if updated:
            print(f"[{source.name}] updated {updated} episode(s)")
        else:
            print(f"[{source.name}] nothing to update")
        total_updated += updated

    print(f"[Backfill] Done — {total_updated} episode(s) updated in total.")


def _extract_audio_url(entry) -> str | None:
    for link in getattr(entry, "enclosures", []):
        url = link.get("href") or link.get("url", "")
        if url:
            return url
    for link in getattr(entry, "links", []):
        if link.get("rel") == "enclosure":
            url = link.get("href") or link.get("url", "")
            if url:
                return url
    return None


def _parse_date(entry) -> str | None:
    from datetime import timezone
    from email.utils import parsedate_to_datetime
    for field in ("published", "updated"):
        raw = entry.get(field)
        if raw:
            try:
                dt = parsedate_to_datetime(raw)
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                pass
    return None


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-id", default=None, help="Backfill a single source by ID")
    args = parser.parse_args()
    backfill_published_at(source_id=args.source_id)
