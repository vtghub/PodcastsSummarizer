"""
Abstract interfaces for every pluggable layer.
Swap local ↔ cloud by providing a different implementation — nothing else changes.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Domain models
# ---------------------------------------------------------------------------

@dataclass
class PodcastSource:
    id: str
    name: str
    url: str                    # RSS feed URL or YouTube channel/playlist URL
    source_type: str            # "rss" | "youtube"
    domain: str                 # e.g. "Technology & AI"
    enabled: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    platform_links: dict = field(default_factory=dict)  # {spotify, apple, youtube, website}
    backoff_until: datetime | None = None               # skip fetch until this time (429/503)
    fetch_error_count: int = 0                          # consecutive fetch failures
    platform_links_attempted_at: datetime | None = None # last platform-link discovery attempt


@dataclass
class Episode:
    id: str
    source_id: str
    title: str
    url: str                    # direct audio/video URL
    published_at: datetime
    duration_seconds: int = 0
    description: str = ""
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class Transcript:
    episode_id: str
    text: str
    language: str = "en"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class UserDigestProfile:
    user_id: str
    email: str
    display_name: str
    digest_hour: int = 19          # UTC hour to send digest
    digest_domains: list[str] | None = None   # None = all domains
    digest_frequency: str = "daily"           # 'daily' or 'weekly'
    digest_day_of_week: int = 0               # 0=Monday … 6=Sunday (Python weekday)
    digest_timezone: str = "America/New_York" # IANA timezone string


@dataclass
class Insight:
    id: str
    episode_id: str
    source_id: str
    domain: str
    date: str                   # YYYY-MM-DD
    summary: str
    key_points: list[str]
    key_quotes: list[str]
    action_items: list[str]
    tags: list[str]
    title_en: str = ""           # English translation of episode.title (empty if extraction predates this field)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# ---------------------------------------------------------------------------
# Provider interfaces
# ---------------------------------------------------------------------------

class SourceProvider(ABC):
    """Fetches new episodes from a podcast source."""

    @abstractmethod
    def fetch_latest_episodes(self, source: PodcastSource, since: datetime | None = None) -> list[Episode]:
        ...

    @abstractmethod
    def fetch_transcript_text(self, episode: Episode) -> str | None:
        """
        Try to obtain a plain-text transcript without downloading audio.
        Returns the transcript string, or None if unavailable.
        Implementations should try all text sources (captions, RSS tags, etc.)
        before returning None.
        """
        ...

    @abstractmethod
    def download_audio(self, episode: Episode, output_dir: str) -> str:
        """
        Last-resort fallback: download the audio file.
        Returns local file path. Only called when fetch_transcript_text() returns None.
        """
        ...


class TranscriptionProvider(ABC):
    """Converts audio file → text transcript."""

    @abstractmethod
    def transcribe(self, audio_path: str, domain: str = "") -> Transcript:
        ...


def default_rank_insights(insights: list[Insight], domains: list[str], top_n: int = 5) -> list[Insight]:
    """
    Select the top_n most relevant insights for the given domains by sorting on
    richness (key_points + key_quotes count) — no LLM call. Used as the base
    behavior for LLMProvider.rank_insights and as a fallback when an LLM-backed
    ranking (e.g. WaterfallLLMProvider) is unavailable or fails.
    """
    if not insights:
        return []
    scored = sorted(
        insights,
        key=lambda i: len(i.key_points) + len(i.key_quotes),
        reverse=True,
    )
    return scored[:top_n]


class LLMProvider(ABC):
    """Extracts structured insights from a transcript."""

    @abstractmethod
    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        ...

    def rank_insights(self, insights: list[Insight], domains: list[str], top_n: int = 5) -> list[Insight]:
        """
        Select the top_n most relevant insights for the given domains.
        Default: sort by richness (key_points + key_quotes count) — no LLM call.
        Concrete providers may override with an actual LLM ranking call.
        """
        return default_rank_insights(insights, domains, top_n)


class StorageProvider(ABC):
    """Persists and retrieves all domain objects."""

    @abstractmethod
    def save_source(self, source: PodcastSource) -> None: ...

    @abstractmethod
    def get_sources(self, enabled_only: bool = True) -> list[PodcastSource]: ...

    @abstractmethod
    def get_source(self, source_id: str) -> PodcastSource | None: ...

    @abstractmethod
    def save_episode(self, episode: Episode) -> None: ...

    @abstractmethod
    def episode_exists(self, episode_id: str) -> bool:
        """Returns True only for fully-processed (status=done) episodes."""
        ...

    def find_duplicate_episode_id(
        self, source_id: str, title: str, published_at: "datetime"
    ) -> str | None:
        """
        Returns the id of an existing, fully-processed episode with the same
        source/title/published_at, if any — even if this episode's own id
        (derived from its audio URL) doesn't match. Some feeds rotate audio
        URLs (ad-insertion / tracking redirects) on every fetch, which would
        otherwise defeat episode_exists() and cause the same episode to be
        reprocessed under a new id, producing a duplicate insight.
        Default: no-op — both storage providers override this.
        """
        return None

    def update_episode_title_en(self, episode_id: str, title_en: str) -> None:
        """Persist the English translation of an episode's title. Default: no-op."""

    @abstractmethod
    def mark_episode_done(self, episode_id: str) -> None: ...

    @abstractmethod
    def save_transcript(self, transcript: Transcript) -> None: ...

    @abstractmethod
    def save_insight(self, insight: Insight) -> None: ...

    @abstractmethod
    def get_insights_by_date(self, date: str) -> list[Insight]: ...

    @abstractmethod
    def get_insights_by_date_and_domain(self, date: str, domain: str) -> list[Insight]: ...

    @abstractmethod
    def get_available_dates(self) -> list[str]: ...

    def get_users_with_digest_enabled(self) -> list["UserDigestProfile"]:
        """Return users who want a digest today. Default: empty list (local dev)."""
        return []

    def get_user_subscribed_source_ids(self, user_id: str) -> list[str]:
        """Return source IDs the user is subscribed to. Default: empty list."""
        return []

    def update_source_platform_links(self, source_id: str, links: dict) -> None:
        """Persist discovered platform URLs for a source. Default: no-op (local dev)."""

    def upsert_episode_queue_status(
        self, episode_id: str, source_id: str, status: str, error_msg: str | None = None
    ) -> None:
        """Write pipeline status (pending/done/failed) to episode_queue. Default: no-op (local dev)."""

    def update_episode_published_at(self, episode_id: str, published_at: str) -> int:
        """Set published_at on an episode (only if currently null). Returns rows updated. Default: no-op."""
        return 0

    def get_llm_provider_config(self, scope: str = "pipeline") -> dict[str, dict]:
        """
        Returns {provider_key: {"enabled": bool, "priority": int}} overrides
        for a given LLM-consuming feature's waterfall — see provider_registry.py
        for the full slot list and how config is resolved. scope is one of
        'pipeline' (worker extraction), 'ask_ai' (dashboard chat, read
        directly by the dashboard rather than through this method), or
        'recommendations' (weekly best-of-week ranking). A provider_key with
        no entry here falls back to its declared default in PROVIDER_SLOTS.
        Default: empty dict (local dev — code defaults).
        """
        return {}

    def get_episodes_for_retry(self, max_retries: int = 3) -> list[tuple["Episode", "PodcastSource"]]:
        """Return (Episode, PodcastSource) pairs whose pipeline run failed and are due for retry."""
        return []

    def increment_episode_retry(self, episode_id: str, source_id: str, retry_after: "datetime", error_msg: str | None = None) -> None:
        """Increment retry_count, set retry_after, keep status=failed. Default: no-op (local dev)."""

    def update_source_backoff(self, source_id: str, backoff_until: "datetime", error_count: int) -> None:
        """Set backoff_until and fetch_error_count after a 429/503. Default: no-op."""

    def reset_source_backoff(self, source_id: str) -> None:
        """Clear backoff_until and reset fetch_error_count after a successful fetch. Default: no-op."""

    def mark_platform_links_attempted(self, source_id: str) -> None:
        """Set platform_links_attempted_at=NOW() after a discovery attempt. Default: no-op."""

    def get_insights_for_week(self, source_ids: list[str], days: int = 7) -> list[Insight]:
        """Return insights from the past `days` days for the given source IDs. Default: empty list."""
        return []

    def get_trending_sources(
        self, domains: list[str], exclude_ids: list[str], days: int = 7, limit: int = 5
    ) -> list[dict]:
        """Return trending sources not in exclude_ids for the given domains. Default: empty list."""
        return []

    def get_insights_by_date_and_sources(self, date: str, source_ids: list[str]) -> list[Insight]:
        """Return insights for a specific date filtered to the given source IDs."""
        all_insights = self.get_insights_by_date(date)
        if not source_ids:
            return []
        source_set = set(source_ids)
        return [i for i in all_insights if i.source_id in source_set]


class EmailProvider(ABC):
    """Sends the daily digest email."""

    @abstractmethod
    def send_digest(self, to: str, date: str, insights_by_domain: dict[str, list[Insight]]) -> bool:
        ...

    def send_weekly_recommendations(
        self,
        to: str,
        week_of: str,
        top_insights: list[Insight],
        recommended_sources: list[dict],
    ) -> bool:
        """Send the weekly recommendations email. Default: no-op (local dev)."""
        return True
