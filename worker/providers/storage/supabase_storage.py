"""
Supabase (PostgreSQL) implementation of StorageProvider.

Requires:
    pip install psycopg2-binary

Set SUPABASE_DB_URL in .env:
    postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
"""

import json
import re
from contextlib import contextmanager
from datetime import datetime, timezone

import psycopg2
import psycopg2.extras

from worker.core.interfaces import (
    Episode, Insight, PodcastSource, StorageProvider, Transcript, UserDigestProfile,
)
from worker.config.settings import SUPABASE_DB_URL


class SupabaseStorageProvider(StorageProvider):

    def __init__(self, db_url: str = SUPABASE_DB_URL):
        self.db_url = db_url

    def _connect_kwargs(self) -> dict:
        # urlparse misinterprets brackets in passwords like "[PodcastsSummarizer]"
        # as IPv6 literals, returning a wrong hostname. Parse the URL with
        # string ops instead so special characters in the password are safe.
        url = self.db_url
        # strip scheme  (postgresql:// or postgres://)
        rest = re.sub(r'^postgres(?:ql)?(?:\+\w+)?://', '', url)
        last_at = rest.rfind('@')
        userinfo, hostinfo = rest[:last_at], rest[last_at + 1:]
        first_colon = userinfo.index(':')
        user, password = userinfo[:first_colon], userinfo[first_colon + 1:]
        slash = hostinfo.rfind('/')
        host_port, dbname = hostinfo[:slash], hostinfo[slash + 1:]
        host, _, port = host_port.rpartition(':')
        return dict(
            host=host,
            port=int(port) if port else 5432,
            dbname=dbname,
            user=user,
            password=password,
            cursor_factory=psycopg2.extras.RealDictCursor,
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

    def update_source_platform_links(self, source_id: str, links: dict) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET platform_links = %s WHERE id = %s",
                    (json.dumps(links), source_id),
                )

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
    # Per-user digest helpers
    # ------------------------------------------------------------------
    def get_users_with_digest_enabled(self) -> list[UserDigestProfile]:
        """
        Returns all users who have digest_enabled=TRUE in user_profiles,
        joined with their email from auth.users via the Supabase service-role REST API.
        Uses psycopg2 directly — auth.users is in the auth schema, accessible via
        the Supabase DB connection with service-role credentials.
        """
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        p.user_id,
                        p.display_name,
                        p.digest_hour,
                        u.email
                    FROM user_profiles p
                    JOIN auth.users u ON u.id = p.user_id
                    WHERE p.digest_enabled = TRUE
                      AND u.email IS NOT NULL
                      AND u.email_confirmed_at IS NOT NULL
                """)
                rows = cur.fetchall()
        return [
            UserDigestProfile(
                user_id=str(r["user_id"]),
                email=r["email"],
                display_name=r["display_name"] or r["email"].split("@")[0],
                digest_hour=r["digest_hour"],
            )
            for r in rows
        ]

    def get_user_subscribed_source_ids(self, user_id: str) -> list[str]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT source_id FROM user_subscriptions
                    WHERE user_id = %s AND enabled = TRUE
                """, (user_id,))
                return [r["source_id"] for r in cur.fetchall()]

    # ------------------------------------------------------------------
    # Row → dataclass helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_source(row: dict) -> PodcastSource:
        raw_links = row.get("platform_links") or {}
        if isinstance(raw_links, str):
            try:
                raw_links = json.loads(raw_links)
            except Exception:
                raw_links = {}
        return PodcastSource(
            id=row["id"], name=row["name"], url=row["url"],
            source_type=row["source_type"], domain=row["domain"],
            enabled=bool(row["enabled"]),
            created_at=row["created_at"] if isinstance(row["created_at"], datetime)
                       else datetime.fromisoformat(str(row["created_at"])),
            platform_links=raw_links,
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
