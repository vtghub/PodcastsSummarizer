"""
Supabase (PostgreSQL) implementation of StorageProvider.

Requires:
    pip install psycopg2-binary

Set SUPABASE_DB_URL in .env:
    postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
"""

import json
from contextlib import contextmanager
from datetime import datetime, timezone
from urllib.parse import urlparse, unquote

import psycopg2
import psycopg2.extras

from worker.core.interfaces import (
    Episode, Insight, PodcastSource, StorageProvider, Transcript,
)
from worker.config.settings import SUPABASE_DB_URL


class SupabaseStorageProvider(StorageProvider):

    def __init__(self, db_url: str = SUPABASE_DB_URL):
        self.db_url = db_url

    def _connect_kwargs(self) -> dict:
        # psycopg2 strips the project-ref suffix from usernames like
        # "postgres.mygigptehwsmhqaoydla" when parsing a DSN URL, causing
        # auth failures against Supabase's Transaction pooler. Parse manually
        # and pass each component as a keyword argument instead.
        p = urlparse(self.db_url)
        return dict(
            host=p.hostname,
            port=p.port or 5432,
            dbname=(p.path or "/postgres").lstrip("/"),
            user=unquote(p.username or ""),
            password=unquote(p.password or ""),
            cursor_factory=psycopg2.extras.RealDictCursor,
            sslmode="require",
        )

    @contextmanager
    def _conn(self):
        conn = psycopg2.connect(**self._connect_kwargs())
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Sources
    # ------------------------------------------------------------------
    def save_source(self, source: PodcastSource) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sources (id, name, url, source_type, domain, enabled, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        name=EXCLUDED.name, url=EXCLUDED.url,
                        domain=EXCLUDED.domain, enabled=EXCLUDED.enabled
                """, (
                    source.id, source.name, source.url, source.source_type,
                    source.domain, source.enabled, source.created_at,
                ))

    def get_sources(self, enabled_only: bool = True) -> list[PodcastSource]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                if enabled_only:
                    cur.execute("SELECT * FROM sources WHERE enabled = TRUE AND deleted = FALSE ORDER BY domain, name")
                else:
                    cur.execute("SELECT * FROM sources WHERE deleted = FALSE ORDER BY domain, name")
                return [self._row_to_source(r) for r in cur.fetchall()]

    def get_source(self, source_id: str) -> PodcastSource | None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM sources WHERE id = %s", (source_id,))
                row = cur.fetchone()
        return self._row_to_source(row) if row else None

    # ------------------------------------------------------------------
    # Episodes
    # ------------------------------------------------------------------
    def save_episode(self, episode: Episode) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO episodes
                    (id, source_id, title, url, published_at, duration_seconds, description, fetched_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, (
                    episode.id, episode.source_id, episode.title, episode.url,
                    episode.published_at, episode.duration_seconds,
                    episode.description, episode.fetched_at,
                ))

    def episode_exists(self, episode_id: str) -> bool:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM episodes WHERE id = %s AND status = 'done'",
                    (episode_id,)
                )
                return cur.fetchone() is not None

    def mark_episode_done(self, episode_id: str) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE episodes SET status = 'done' WHERE id = %s",
                    (episode_id,)
                )

    # ------------------------------------------------------------------
    # Transcripts
    # ------------------------------------------------------------------
    def save_transcript(self, transcript: Transcript) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO transcripts (episode_id, text, language, created_at)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (episode_id) DO UPDATE SET text=EXCLUDED.text
                """, (
                    transcript.episode_id, transcript.text,
                    transcript.language, transcript.created_at,
                ))

    # ------------------------------------------------------------------
    # Insights
    # ------------------------------------------------------------------
    def save_insight(self, insight: Insight) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO insights
                    (id, episode_id, source_id, domain, date, summary,
                     key_points, key_quotes, action_items, tags, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO UPDATE SET
                        summary=EXCLUDED.summary,
                        key_points=EXCLUDED.key_points,
                        key_quotes=EXCLUDED.key_quotes,
                        action_items=EXCLUDED.action_items,
                        tags=EXCLUDED.tags
                """, (
                    insight.id, insight.episode_id, insight.source_id,
                    insight.domain, insight.date, insight.summary,
                    json.dumps(insight.key_points),
                    json.dumps(insight.key_quotes),
                    json.dumps(insight.action_items),
                    json.dumps(insight.tags),
                    insight.created_at,
                ))

    def get_insights_by_date(self, date: str) -> list[Insight]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM insights WHERE date = %s ORDER BY domain, created_at",
                    (date,)
                )
                return [self._row_to_insight(r) for r in cur.fetchall()]

    def get_insights_by_date_and_domain(self, date: str, domain: str) -> list[Insight]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM insights WHERE date = %s AND domain = %s ORDER BY created_at",
                    (date, domain)
                )
                return [self._row_to_insight(r) for r in cur.fetchall()]

    def get_available_dates(self) -> list[str]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT DISTINCT date FROM insights ORDER BY date DESC")
                return [r["date"] for r in cur.fetchall()]

    # ------------------------------------------------------------------
    # Row → dataclass helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_source(row: dict) -> PodcastSource:
        return PodcastSource(
            id=row["id"], name=row["name"], url=row["url"],
            source_type=row["source_type"], domain=row["domain"],
            enabled=bool(row["enabled"]),
            created_at=row["created_at"] if isinstance(row["created_at"], datetime)
                       else datetime.fromisoformat(str(row["created_at"])),
        )

    @staticmethod
    def _row_to_insight(row: dict) -> Insight:
        def parse(val):
            if isinstance(val, list): return val
            return json.loads(val) if val else []

        return Insight(
            id=row["id"], episode_id=row["episode_id"], source_id=row["source_id"],
            domain=row["domain"], date=row["date"], summary=row["summary"],
            key_points=parse(row["key_points"]),
            key_quotes=parse(row["key_quotes"]),
            action_items=parse(row["action_items"]),
            tags=parse(row["tags"]),
            created_at=row["created_at"] if isinstance(row["created_at"], datetime)
                       else datetime.fromisoformat(str(row["created_at"])),
        )
