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
    digest_hour: int = 19  # UTC hour to send digest


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
    def transcribe(self, audio_path: str) -> Transcript:
        ...


class LLMProvider(ABC):
    """Extracts structured insights from a transcript."""

    @abstractmethod
    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        ...


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
