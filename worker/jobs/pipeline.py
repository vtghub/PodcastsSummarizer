"""
Main pipeline job — orchestrates the full ingestion → transcript → extraction → store flow.

Episode processing order:
  1. fetch_transcript_text()  — text/caption sources (no audio download)
  2. download_audio() + Whisper — fallback only if step 1 returns None

Performance: sources are RSS-fetched in parallel; episodes are processed (LLM / transcript)
concurrently up to _EPISODE_WORKERS simultaneous workers.
"""

import os
import threading
import traceback
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from worker.core.interfaces import PodcastSource, Transcript
from worker.core.registry import (
    get_email_provider, get_llm_provider,
    get_storage_provider, get_transcription_provider,
)
from worker.config.settings import DIGEST_RECIPIENT, AUDIO_CACHE_DIR, GROQ_API_KEY
from worker.providers.source.rss_source import RSSSourceProvider
from worker.providers.source.youtube_source import YouTubeSourceProvider

_FETCH_WORKERS = 8    # parallel RSS / YouTube metadata fetches
_EPISODE_WORKERS = 4  # concurrent LLM + transcript workers
_WHISPER_LOCK = threading.Lock()  # prevent simultaneous Whisper runs (CPU-bound)


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
    stats_lock = threading.Lock()
    errors: list[str] = []
    errors_lock = threading.Lock()
    date_str = datetime.now().strftime("%Y-%m-%d")

    # ── Phase 1: fetch all source episode lists in parallel ─────────────────
    source_batches: list[tuple] = []  # (source, provider, episodes)

    def _fetch(src: PodcastSource):
        prov = _get_source_provider(src)
        eps = prov.fetch_latest_episodes(src, since=since)
        return src, prov, eps

    with ThreadPoolExecutor(max_workers=min(len(sources), _FETCH_WORKERS)) as ex:
        fetch_futures = {ex.submit(_fetch, s): s for s in sources}
        for f in as_completed(fetch_futures):
            src = fetch_futures[f]
            try:
                source, provider, episodes = f.result()
                print(f"[{source.name}] {len(episodes)} new episode(s)")
                source_batches.append((source, provider, episodes))
            except Exception as e:
                msg = f"[ERROR] Fetch failed for {src.name}: {e}"
                print(msg)
                with errors_lock:
                    errors.append(msg)
                with stats_lock:
                    stats["errors"] += 1

    # ── Phase 2: process all episodes concurrently ───────────────────────────
    all_work = [
        (source, provider, ep)
        for source, provider, episodes in source_batches
        for ep in episodes
    ]

    def _process(source: PodcastSource, provider, episode) -> tuple[str, str | None]:
        """Returns (stat_key, optional_error_message)."""
        tag = f"[{source.name}] [{episode.title[:50]}]"

        if storage.episode_exists(episode.id):
            print(f"  {tag} already processed — skip")
            return "skipped", None

        if dry_run:
            print(f"  {tag} dry-run — skip")
            return "skipped", None

        storage.save_episode(episode)

        # ── Step 1: text transcript ──────────────────────────────────────
        transcript_text: str | None = None
        transcript_source = ""
        try:
            transcript_text = provider.fetch_transcript_text(episode)
            if transcript_text:
                transcript_source = "text"
        except Exception as e:
            print(f"  {tag} [warn] text transcript failed: {e}")

        # ── Step 2: Whisper fallback (serialised — CPU-bound) ────────────
        if not transcript_text:
            print(f"  {tag} downloading audio for Whisper…")
            audio_path: str | None = None
            try:
                audio_path = provider.download_audio(episode)
            except Exception as e:
                return "errors", f"  {tag} [ERROR] audio download: {e}"
            try:
                with _WHISPER_LOCK:
                    transcriber = get_transcription_provider()
                    result = transcriber.transcribe(audio_path)
                transcript_text = result.text
                transcript_source = "whisper"
                print(f"  {tag} Whisper: {len(transcript_text):,} chars")
            except Exception as e:
                return "errors", f"  {tag} [ERROR] Whisper: {e}"
            finally:
                if audio_path and os.path.exists(audio_path):
                    os.remove(audio_path)

        if not transcript_text:
            return "errors", f"  {tag} [ERROR] no transcript available"

        transcript = Transcript(episode_id=episode.id, text=transcript_text, language="en")
        storage.save_transcript(transcript)
        print(f"  {tag} transcript [{transcript_source}]: {len(transcript_text):,} chars")

        # ── Step 3: LLM insight extraction ──────────────────────────────
        try:
            insight = llm.extract_insights(episode, transcript, domain=source.domain)
            insight.date = date_str
        except Exception as e:
            # Auto-fallback: if Gemini quota exhausted and Groq key available, retry with Groq
            if _is_quota_error(e) and GROQ_API_KEY:
                print(f"  {tag} Gemini quota — falling back to Groq")
                try:
                    from worker.providers.llm.groq_llm import GroqLLMProvider
                    groq = GroqLLMProvider()
                    insight = groq.extract_insights(episode, transcript, domain=source.domain)
                    insight.date = date_str
                except Exception as groq_e:
                    return "errors", f"  {tag} [ERROR] Groq fallback also failed: {groq_e}"
            else:
                return "errors", f"  {tag} [ERROR] LLM: {e}"

        storage.save_insight(insight)
        storage.mark_episode_done(episode.id)
        print(f"  {tag} insights: {len(insight.key_points)} points, {len(insight.key_quotes)} quotes")
        return "insights", None

    with ThreadPoolExecutor(max_workers=_EPISODE_WORKERS) as ex:
        ep_futures = {
            ex.submit(_process, src, prov, ep): (src, ep)
            for src, prov, ep in all_work
        }
        for f in as_completed(ep_futures):
            try:
                status, error_msg = f.result()
                with stats_lock:
                    stats[status] += 1
                    if status == "insights":
                        stats["processed"] += 1
                if error_msg:
                    print(error_msg)
                    with errors_lock:
                        errors.append(error_msg)
            except Exception as e:
                msg = f"[ERROR] Unexpected worker error: {e}"
                print(msg)
                with errors_lock:
                    errors.append(msg)
                with stats_lock:
                    stats["errors"] += 1

    # ── Phase 3: digest email ────────────────────────────────────────────────
    if send_email and not dry_run and stats["insights"] > 0:
        _send_digest(storage, date_str)

    print(f"\n[Pipeline] Done — {stats}")
    if errors:
        print("[Pipeline] Errors:")
        for e in errors:
            print(f"  {e}")

    return {**stats, "date": date_str, "errors": errors}


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ("resource_exhausted", "quota", "429"))


def _get_source_provider(source: PodcastSource):
    if source.source_type == "youtube":
        return YouTubeSourceProvider()
    return RSSSourceProvider()


def _send_digest(storage, date_str: str):
    email = get_email_provider()
    insights = storage.get_insights_by_date(date_str)
    if not insights:
        print("[Email] No insights for today — skipping.")
        return

    by_domain: dict[str, list] = defaultdict(list)
    for ins in insights:
        by_domain[ins.domain].append(ins)

    try:
        email.send_digest(DIGEST_RECIPIENT, date_str, dict(by_domain))
    except Exception as e:
        print(f"[Email] Send failed: {e}")
        traceback.print_exc()
