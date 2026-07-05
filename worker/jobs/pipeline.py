"""
Main pipeline job — orchestrates the full ingestion → transcript → extraction → store flow.

Transcript acquisition order (per episode):
  1. fetch_transcript_text()  — text/caption sources (no audio download)
  2. download_audio() + Whisper — fallback only if step 1 returns None
"""

import os
import traceback
from collections import defaultdict
from datetime import datetime, timezone

from worker.core.interfaces import PodcastSource, Transcript
from worker.core.registry import (
    get_email_provider, get_llm_provider,
    get_storage_provider, get_transcription_provider,
)
from worker.config.settings import DIGEST_RECIPIENT, AUDIO_CACHE_DIR
from worker.providers.source.rss_source import RSSSourceProvider
from worker.providers.source.youtube_source import YouTubeSourceProvider


def run_pipeline(
    since: datetime | None = None,
    send_email: bool = True,
    dry_run: bool = False,
) -> dict:
    """
    Full daily pipeline. Returns a summary dict with counts and errors.

    Args:
        since:      Only process episodes published after this datetime.
                    Defaults to 24 hours ago.
        send_email: Whether to send the digest email after processing.
        dry_run:    Fetch and list episodes only — no download, no LLM, no email.
    """
    if since is None:
        from datetime import timedelta
        since = datetime.now(timezone.utc) - timedelta(hours=24)

    storage = get_storage_provider()
    llm = get_llm_provider()

    sources = storage.get_sources(enabled_only=True)
    print(f"[Pipeline] Running for {len(sources)} source(s) | since={since.date()}")

    stats = {"processed": 0, "skipped": 0, "errors": 0, "insights": 0}
    errors: list[str] = []
    date_str = datetime.now().strftime("%Y-%m-%d")

    for source in sources:
        print(f"\n[Pipeline] Source: {source.name} ({source.source_type})")
        source_provider = _get_source_provider(source)

        try:
            episodes = source_provider.fetch_latest_episodes(source, since=since)
        except Exception as e:
            msg = f"  [ERROR] Fetch failed for {source.name}: {e}"
            print(msg); errors.append(msg); stats["errors"] += 1
            continue

        print(f"  Found {len(episodes)} new episode(s)")

        for episode in episodes:
            if storage.episode_exists(episode.id):
                print(f"  [skip] Already processed: {episode.title[:60]}")
                stats["skipped"] += 1
                continue

            print(f"  [process] {episode.title[:70]}")

            if dry_run:
                stats["skipped"] += 1
                continue

            storage.save_episode(episode)

            # ---------------------------------------------------------------
            # Step 1: try to get transcript text without audio download
            # ---------------------------------------------------------------
            transcript_text: str | None = None
            transcript_source: str = ""

            try:
                transcript_text = source_provider.fetch_transcript_text(episode)
                if transcript_text:
                    transcript_source = "text"
            except Exception as e:
                print(f"    [warn] Text transcript fetch failed: {e}")

            # ---------------------------------------------------------------
            # Step 2: fallback — download audio and run Whisper
            # ---------------------------------------------------------------
            if not transcript_text:
                print(f"    [fallback] No text transcript — downloading audio for Whisper...")
                audio_path: str | None = None
                try:
                    audio_path = source_provider.download_audio(episode)
                    print(f"    > Downloaded: {os.path.basename(audio_path)}")
                except Exception as e:
                    msg = f"    [ERROR] Audio download failed: {e}"
                    print(msg); errors.append(msg); stats["errors"] += 1
                    continue

                try:
                    transcriber = get_transcription_provider()
                    whisper_result = transcriber.transcribe(audio_path)
                    transcript_text = whisper_result.text
                    transcript_source = "whisper"
                    print(f"    > Whisper transcribed: {len(transcript_text):,} chars")
                except Exception as e:
                    msg = f"    [ERROR] Whisper transcription failed: {e}"
                    print(msg); errors.append(msg); stats["errors"] += 1
                    continue
                finally:
                    if audio_path and os.path.exists(audio_path):
                        os.remove(audio_path)

            if not transcript_text:
                msg = f"    [ERROR] No transcript available for: {episode.title[:60]}"
                print(msg); errors.append(msg); stats["errors"] += 1
                continue

            # ---------------------------------------------------------------
            # Step 3: persist transcript
            # ---------------------------------------------------------------
            transcript = Transcript(
                episode_id=episode.id,
                text=transcript_text,
                language="en",
            )
            storage.save_transcript(transcript)
            print(f"    > Transcript ready [{transcript_source}]: {len(transcript_text):,} chars")

            # ---------------------------------------------------------------
            # Step 4: extract insights via LLM
            # ---------------------------------------------------------------
            try:
                insight = llm.extract_insights(episode, transcript, domain=source.domain)
                insight.date = date_str
                storage.save_insight(insight)
                storage.mark_episode_done(episode.id)
                print(f"    > Insights extracted: {len(insight.key_points)} points, {len(insight.key_quotes)} quotes")
                stats["insights"] += 1
            except Exception as e:
                msg = f"    [ERROR] LLM extraction failed: {e}"
                print(msg); errors.append(msg); stats["errors"] += 1
                continue

            stats["processed"] += 1

    # ---------------------------------------------------------------
    # Step 5: send digest email
    # ---------------------------------------------------------------
    if send_email and not dry_run and stats["insights"] > 0:
        _send_digest(storage, date_str)

    print(f"\n[Pipeline] Done -- {stats}")
    if errors:
        print("[Pipeline] Errors:")
        for e in errors:
            print(f"  {e}")

    return {**stats, "date": date_str, "errors": errors}


def _get_source_provider(source: PodcastSource):
    if source.source_type == "youtube":
        return YouTubeSourceProvider()
    return RSSSourceProvider()


def _send_digest(storage, date_str: str):
    email = get_email_provider()
    insights = storage.get_insights_by_date(date_str)
    if not insights:
        print("[Email] No insights for today -- skipping.")
        return

    by_domain: dict[str, list] = defaultdict(list)
    for ins in insights:
        by_domain[ins.domain].append(ins)

    try:
        email.send_digest(DIGEST_RECIPIENT, date_str, dict(by_domain))
    except Exception as e:
        print(f"[Email] Send failed: {e}")
        traceback.print_exc()
