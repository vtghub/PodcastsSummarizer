"""
Main pipeline job — orchestrates the full ingestion → transcript → extraction → store flow.

Episode processing order:
  1. fetch_transcript_text()  — text/caption sources (no audio download)
  2. download_audio() + Whisper — fallback only if step 1 returns None

Performance: sources are RSS-fetched in parallel; episodes are processed (LLM / transcript)
concurrently up to _EPISODE_WORKERS simultaneous workers.
"""

import hashlib
import os
import threading
import traceback
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from worker.core.interfaces import PodcastSource
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
    force_email: bool = False,
) -> dict:
    """
    Full daily pipeline. Returns a summary dict with counts and errors.

    Args:
        since:       Only process episodes published after this datetime.
                     Defaults to 24 hours ago.
        send_email:  Whether to send the digest email after processing.
        dry_run:     Fetch and list episodes only — no download, no LLM, no email.
        force_email: Send digest using today's existing DB insights even if
                     no new episodes were processed this run (for testing).
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

    _PLATFORM_LINKS_RETRY_DAYS = 7

    def _fetch(src: PodcastSource):
        prov = _get_source_provider(src)
        try:
            eps = prov.fetch_latest_episodes(src, since=since)
        except Exception as exc:
            # Detect rate-limit / service-unavailable from feedparser status codes
            status_code = getattr(exc, "status_code", None) or getattr(exc, "code", None)
            raise exc  # re-raise; 429/503 handled in the outer except below
        # Check if feedparser itself flagged a rate-limit or server error
        # (fetch_latest_episodes may surface these via the returned feed object)
        http_status = getattr(prov, "_last_feed_status", None)
        if http_status in (429, 503):
            from datetime import timedelta
            error_count = (src.fetch_error_count or 0) + 1
            delay_hours = min(2 ** (error_count - 1), 24)  # 1h, 2h, 4h, … 24h cap
            backoff_until = datetime.now(timezone.utc) + timedelta(hours=delay_hours)
            storage.update_source_backoff(src.id, backoff_until, error_count)
            raise RuntimeError(f"HTTP {http_status} — backing off {delay_hours}h (attempt {error_count})")
        # Successful fetch — clear any previous backoff
        if src.fetch_error_count > 0 or src.backoff_until:
            storage.reset_source_backoff(src.id)
        # Discover platform links: attempt if never tried or last attempt > 7 days ago
        from datetime import timedelta
        platform_stale = (
            src.platform_links_attempted_at is None
            or (datetime.now(timezone.utc) - src.platform_links_attempted_at).days >= _PLATFORM_LINKS_RETRY_DAYS
        )
        if platform_stale and hasattr(prov, "fetch_platform_links"):
            try:
                links = prov.fetch_platform_links(src)
                if links:
                    storage.update_source_platform_links(src.id, links)
                    src.platform_links = links
                    print(f"[{src.name}] platform links: {list(links.keys())}")
            except Exception as e:
                print(f"[{src.name}] [warn] platform link discovery failed: {e}")
            storage.mark_platform_links_attempted(src.id)
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

    # Re-queue previously-failed episodes that are due for retry (max 3 attempts)
    if not dry_run:
        try:
            retry_pairs = storage.get_episodes_for_retry(max_retries=3)
            if retry_pairs:
                print(f"[Pipeline] Retrying {len(retry_pairs)} previously-failed episode(s)")
            for ep, src in retry_pairs:
                # Skip if already in this run's work list
                if not any(e.id == ep.id for _, _, e in all_work):
                    all_work.append((src, _get_source_provider(src), ep))
        except Exception as e:
            print(f"[Pipeline] [warn] Could not load retry queue: {e}")

    # Pre-load Whisper model in the main thread before workers start so no
    # episode worker pays the model-load cost while holding _WHISPER_LOCK.
    if all_work and not dry_run:
        get_transcription_provider()

    def _process(source: PodcastSource, provider, episode) -> tuple[str, str | None]:
        """Returns (stat_key, optional_error_message)."""
        if dry_run:
            tag = f"[{source.name}] [{episode.title[:50]}]"
            print(f"  {tag} dry-run — skip")
            return "skipped", None
        return _process_episode(storage, llm, source, provider, episode, date_str)

    with ThreadPoolExecutor(max_workers=_EPISODE_WORKERS) as ex:
        ep_futures = {
            ex.submit(_process, src, prov, ep): (src, ep)
            for src, prov, ep in all_work
        }
        for f in as_completed(ep_futures):
            src, ep = ep_futures[f]
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
                # Queue failed episodes for retry on the next pipeline run
                if status == "errors" and not dry_run:
                    from datetime import timedelta
                    retry_after = datetime.now(timezone.utc) + timedelta(hours=1)
                    try:
                        storage.increment_episode_retry(ep.id, src.id, retry_after, error_msg)
                    except Exception as re:
                        print(f"[Pipeline] [warn] Could not queue retry for {ep.id[:8]}: {re}")
            except Exception as e:
                msg = f"[ERROR] Unexpected worker error: {e}"
                print(msg)
                with errors_lock:
                    errors.append(msg)
                with stats_lock:
                    stats["errors"] += 1

    # ── Post-Phase 2: invalidate the dashboard's public cache ───────────────
    if stats["insights"] > 0 and not dry_run:
        _revalidate_dashboard_cache(date_str)

    # ── Phase 3: digest email ────────────────────────────────────────────────
    should_email = send_email and not dry_run and (stats["insights"] > 0 or force_email)
    if should_email:
        email_date = date_str
        if force_email and stats["insights"] == 0:
            # Use most recent date with insights instead of today (which has none yet)
            available = storage.get_available_dates()
            email_date = available[0] if available else date_str
            print(f"[Email] force_email=True — sending digest from existing DB insights ({email_date})")
        _send_per_user_digests(storage, email_date)

    print(f"\n[Pipeline] Done — {stats}")
    if errors:
        print("[Pipeline] Errors:")
        for e in errors:
            print(f"  {e}")

    return {**stats, "date": date_str, "errors": errors}


def run_single_episode(
    audio_url: str,
    source_id: str,
    user_email: str = "",
    send_email: bool = True,
) -> dict:
    """
    Process one specific episode (identified by its audio URL) and optionally
    send a targeted digest email to user_email.

    Used by on-demand processing triggered from the dashboard.
    """
    storage = get_storage_provider()
    llm = get_llm_provider()
    date_str = datetime.now().strftime("%Y-%m-%d")

    source = storage.get_source(source_id)
    if not source:
        return {"error": f"Source {source_id} not found", "date": date_str}

    provider = _get_source_provider(source)

    from datetime import timedelta
    from urllib.parse import unquote as _unquote
    from worker.core.interfaces import Episode as _Episode

    norm_url = _unquote(audio_url)
    episode_id = hashlib.md5(norm_url.encode()).hexdigest()

    # Fast path: already processed — just resend the email
    if storage.episode_exists(episode_id):
        print(f"[SingleEpisode] Already processed ({episode_id[:8]}), resending email")
        if send_email and user_email:
            email = get_email_provider()
            from collections import defaultdict
            insights = storage.get_insights_by_date_and_sources(date_str, [source_id])
            # Fall back to any date if today has no insights for this episode
            if not any(i.episode_id == episode_id for i in insights):
                insights = [i for d in storage.get_available_dates() or []
                            for i in storage.get_insights_by_date_and_sources(d, [source_id])
                            if i.episode_id == episode_id]
            ep_insights = [i for i in insights if i.episode_id == episode_id]
            if ep_insights:
                by_domain: dict[str, list] = defaultdict(list)
                for ins in ep_insights:
                    by_domain[ins.domain].append(ins)
                try:
                    email.send_digest(user_email, ep_insights[0].date, dict(by_domain))
                    print(f"[SingleEpisode] Digest resent to {user_email}")
                except Exception as e:
                    print(f"[SingleEpisode] Email send failed: {e}")
        return {"stat": "resent", "error": None, "date": date_str}

    # Try to locate episode in RSS feed (covers recent episodes)
    since = datetime.now(timezone.utc) - timedelta(days=365)
    try:
        episodes = provider.fetch_latest_episodes(source, since=since)
    except Exception as e:
        return {"error": f"RSS fetch failed: {e}", "date": date_str}

    episode = next((e for e in episodes if _unquote(e.url) == norm_url), None)

    # Fallback: episode is older than the RSS feed window — synthesise a minimal Episode
    if not episode:
        print(f"[SingleEpisode] Not in feed, constructing minimal episode from URL")
        episode = _Episode(
            id=episode_id,
            source_id=source_id,
            title="(Episode)",
            url=norm_url,
            published_at=datetime.now(timezone.utc),
            duration_seconds=0,
            description="",
        )

    print(f"[SingleEpisode] Processing: {episode.title[:80]}")

    stat, error_msg = _process_episode(storage, llm, source, provider, episode, date_str)
    if error_msg:
        print(error_msg)

    # Signal completion status via episode_queue so the dashboard Realtime listener
    # can react instantly — on both success and failure.
    queue_status = "done" if stat == "insights" else "failed"
    try:
        storage.upsert_episode_queue_status(episode.id, source_id, queue_status, error_msg)
        print(f"[SingleEpisode] Queue status → {queue_status}")
    except Exception as e:
        print(f"[SingleEpisode] Failed to write queue status: {e}")

    if stat == "insights" and send_email and user_email:
        email = get_email_provider()
        from collections import defaultdict
        insights = storage.get_insights_by_date_and_sources(date_str, [source_id])
        ep_insights = [i for i in insights if i.episode_id == episode.id]
        if ep_insights:
            by_domain: dict[str, list] = defaultdict(list)
            for ins in ep_insights:
                by_domain[ins.domain].append(ins)
            try:
                email.send_digest(user_email, date_str, dict(by_domain))
                print(f"[SingleEpisode] Digest sent to {user_email}")
            except Exception as e:
                print(f"[SingleEpisode] Email send failed: {e}")

    return {"stat": stat, "error": error_msg, "date": date_str}


def run_digest_fanout(date_str: str | None = None) -> None:
    """
    Send digest emails to all eligible users for a given date.
    Called by the hourly digest workflow — no ingestion, just email fan-out.
    Respects each user's digest_hour and digest_timezone preferences.
    """
    storage = get_storage_provider()
    if date_str is None:
        date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"[DigestFanout] Running for date={date_str}")
    _send_per_user_digests(storage, date_str)


def _process_episode(
    storage, llm, source: "PodcastSource", provider, episode, date_str: str
) -> tuple[str, str | None]:
    """Extract insights from one episode. Returns (stat_key, error_msg|None)."""
    tag = f"[{source.name}] [{episode.title[:50]}]"

    if storage.episode_exists(episode.id):
        print(f"  {tag} already processed — skip")
        return "skipped", None

    storage.save_episode(episode)

    transcript_text: str | None = None
    transcript_source = ""
    try:
        transcript_text = provider.fetch_transcript_text(episode)
        if transcript_text:
            transcript_source = "text"
    except Exception as e:
        print(f"  {tag} [warn] text transcript failed: {e}")

    if not transcript_text:
        print(f"  {tag} downloading audio for Whisper…")
        audio_path: str | None = None
        try:
            audio_path = provider.download_audio(episode)
        except Exception as e:
            return "errors", f"  {tag} [ERROR] audio download: {e}"
        try:
            transcriber = get_transcription_provider()  # singleton — no I/O after first call
            with _WHISPER_LOCK:
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

    from worker.core.interfaces import Transcript
    transcript = Transcript(episode_id=episode.id, text=transcript_text, language="en")
    storage.save_transcript(transcript)
    print(f"  {tag} transcript [{transcript_source}]: {len(transcript_text):,} chars")

    try:
        insight = llm.extract_insights(episode, transcript, domain=source.domain)
        insight.date = date_str
    except Exception as e:
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


def _is_quota_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(k in msg for k in ("resource_exhausted", "quota", "429"))


def _get_source_provider(source: PodcastSource):
    if source.source_type == "youtube":
        return YouTubeSourceProvider()
    return RSSSourceProvider()


_EMAIL_WORKERS = 8  # max concurrent SMTP connections for digest fan-out


def _send_per_user_digests(storage, date_str: str):
    """Fan out personalised digest emails to every user with digest_enabled=TRUE."""
    email = get_email_provider()

    try:
        users = storage.get_users_with_digest_enabled()
    except Exception as e:
        print(f"[Email] Could not load digest users: {e}")
        traceback.print_exc()
        return

    if not users:
        # Fallback for local SQLite dev: send the old single-recipient digest
        _send_single_digest(storage, date_str, email)
        return

    print(f"[Email] Sending digests to {len(users)} user(s)")

    def _send_one(user):
        # Resolve user's local time once — used for hour check, DOW check, and date lookup
        try:
            user_tz = ZoneInfo(user.digest_timezone)
            local_now = datetime.now(user_tz)
            user_local_date = local_now.strftime("%Y-%m-%d")
        except ZoneInfoNotFoundError:
            print(f"[Email] {user.email} — unknown timezone '{user.digest_timezone}', using UTC date")
            local_now = datetime.now(timezone.utc)
            user_local_date = date_str  # fall back to the UTC date

        # Check if the current hour in the user's timezone matches their chosen send hour
        if local_now.hour != user.digest_hour:
            print(f"[Email] {user.email} — not their send hour (local={local_now.hour}, want={user.digest_hour}), skipping")
            return

        # Weekly users only receive on their chosen day of week (0=Monday…6=Sunday)
        if user.digest_frequency == "weekly":
            if local_now.weekday() != user.digest_day_of_week:
                print(f"[Email] {user.email} — weekly digest not scheduled today, skipping")
                return

        source_ids = storage.get_user_subscribed_source_ids(user.user_id)
        if not source_ids:
            print(f"[Email] {user.email} — no subscriptions, skipping")
            return
        # Use the user's LOCAL date so that evening sends (e.g. 8 PM EST = midnight UTC)
        # look up insights for the correct day rather than the next UTC day.
        insights = storage.get_insights_by_date_and_sources(user_local_date, source_ids)
        if not insights:
            print(f"[Email] {user.email} — no insights for {user_local_date}, skipping")
            return
        by_domain: dict[str, list] = defaultdict(list)
        for ins in insights:
            if user.digest_domains is None or ins.domain in user.digest_domains:
                by_domain[ins.domain].append(ins)
        if not by_domain:
            print(f"[Email] {user.email} — no insights match domain filter, skipping")
            return
        ok = email.send_digest(user.email, user_local_date, dict(by_domain))
        status = "sent" if ok else "failed"
        print(f"[Email] {user.email} — {len(insights)} insight(s) for {user_local_date} — {status}")

    with ThreadPoolExecutor(max_workers=min(len(users), _EMAIL_WORKERS)) as ex:
        futures = {ex.submit(_send_one, u): u for u in users}
        for fut in as_completed(futures):
            user = futures[fut]
            exc = fut.exception()
            if exc:
                print(f"[Email] {user.email} — error: {exc}")
                traceback.print_exc()


def _revalidate_dashboard_cache(date_str: str) -> None:
    """Call the Next.js on-demand revalidation endpoint so public guests see fresh insights."""
    import requests as _requests
    url = os.getenv("NEXT_APP_URL", "").rstrip("/")
    secret = os.getenv("REVALIDATE_SECRET", "")
    if not url or not secret:
        return
    try:
        resp = _requests.post(
            f"{url}/api/revalidate",
            headers={"x-revalidate-secret": secret},
            timeout=10,
        )
        if resp.ok:
            print(f"[Pipeline] Dashboard cache revalidated ({date_str})")
        else:
            print(f"[Pipeline] Revalidation failed: HTTP {resp.status_code}")
    except Exception as e:
        print(f"[Pipeline] Revalidation error (non-fatal): {e}")


def _send_single_digest(storage, date_str: str, email):
    """Legacy single-recipient digest for local SQLite dev mode."""
    if not DIGEST_RECIPIENT:
        print("[Email] DIGEST_RECIPIENT not set — skipping.")
        return

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
