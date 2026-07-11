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
                    cur.execute("""
                        SELECT * FROM sources
                        WHERE enabled = TRUE AND deleted = FALSE
                          AND (backoff_until IS NULL OR backoff_until <= NOW())
                        ORDER BY domain, name
                    """)
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

    def upsert_episode_queue_status(
        self, episode_id: str, source_id: str, status: str, error_msg: str | None = None
    ) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO episode_queue (episode_id, source_id, status, error_msg, updated_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON CONFLICT (episode_id) DO UPDATE
                      SET status = EXCLUDED.status,
                          error_msg = EXCLUDED.error_msg,
                          updated_at = NOW()
                    """,
                    (episode_id, source_id, status, error_msg),
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

    def find_duplicate_episode_id(self, source_id: str, title: str, published_at) -> str | None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id FROM episodes
                    WHERE source_id = %s AND title = %s AND published_at = %s AND status = 'done'
                    LIMIT 1
                    """,
                    (source_id, title, published_at),
                )
                row = cur.fetchone()
                return row["id"] if row else None

    def update_episode_title_en(self, episode_id: str, title_en: str) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE episodes SET title_en = %s WHERE id = %s",
                    (title_en, episode_id),
                )

    def get_llm_provider_config(self) -> dict[str, dict]:
        try:
            with self._conn() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT provider_key, enabled, priority FROM llm_provider_config")
                    rows = cur.fetchall()
            return {
                row["provider_key"]: {"enabled": row["enabled"], "priority": row["priority"]}
                for row in rows
            }
        except Exception as e:
            # Table may not exist yet (migration 018 not applied) — fall back
            # to PROVIDER_SLOTS' code defaults rather than breaking the pipeline.
            print(f"[LLMProviderConfig] couldn't read llm_provider_config ({e}) — using code defaults")
            return {}

    def mark_episode_done(self, episode_id: str) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE episodes SET status = 'done' WHERE id = %s",
                    (episode_id,)
                )

    def update_episode_published_at(self, episode_id: str, published_at: str) -> int:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE episodes SET published_at = %s WHERE id = %s AND published_at IS NULL",
                    (published_at, episode_id)
                )
                return cur.rowcount

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
                    "SELECT * FROM insights WHERE date = %s ORDER BY domain, created_at DESC",
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
    # Pipeline resilience helpers
    # ------------------------------------------------------------------
    def get_episodes_for_retry(self, max_retries: int = 3) -> list[tuple]:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT e.*, s.*,
                           eq.retry_count, eq.error_msg AS eq_error_msg
                    FROM episode_queue eq
                    JOIN episodes e ON e.id = eq.episode_id
                    JOIN sources  s ON s.id = eq.source_id
                    WHERE eq.status = 'failed'
                      AND eq.retry_count < %s
                      AND (eq.retry_after IS NULL OR eq.retry_after <= NOW())
                      AND e.status != 'done'
                """, (max_retries,))
                rows = cur.fetchall()
        result = []
        for r in rows:
            from worker.core.interfaces import Episode as _Ep
            ep = _Ep(
                id=r["episode_id"], source_id=r["source_id"],
                title=r["title"] or "(Untitled)", url=r["url"] or "",
                published_at=r["published_at"] or datetime.now(timezone.utc),
                duration_seconds=r.get("duration_seconds") or 0,
                description=r.get("description") or "",
            )
            src = self._row_to_source(r)
            result.append((ep, src))
        return result

    def increment_episode_retry(
        self, episode_id: str, source_id: str,
        retry_after: datetime, error_msg: str | None = None,
    ) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO episode_queue
                      (episode_id, source_id, status, retry_count, retry_after, error_msg, updated_at)
                    VALUES (%s, %s, 'failed', 1, %s, %s, NOW())
                    ON CONFLICT (episode_id) DO UPDATE
                      SET status      = 'failed',
                          retry_count = episode_queue.retry_count + 1,
                          retry_after = EXCLUDED.retry_after,
                          error_msg   = EXCLUDED.error_msg,
                          updated_at  = NOW()
                """, (episode_id, source_id, retry_after, error_msg))

    def update_source_backoff(self, source_id: str, backoff_until: datetime, error_count: int) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET backoff_until=%s, fetch_error_count=%s WHERE id=%s",
                    (backoff_until, error_count, source_id),
                )

    def reset_source_backoff(self, source_id: str) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET backoff_until=NULL, fetch_error_count=0 WHERE id=%s",
                    (source_id,),
                )

    def mark_platform_links_attempted(self, source_id: str) -> None:
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET platform_links_attempted_at=NOW() WHERE id=%s",
                    (source_id,),
                )

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
                        p.digest_domains,
                        p.digest_frequency,
                        p.digest_day_of_week,
                        p.digest_timezone,
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
                digest_domains=list(r["digest_domains"]) if r["digest_domains"] else None,
                digest_frequency=r["digest_frequency"] or "daily",
                digest_day_of_week=r["digest_day_of_week"] if r["digest_day_of_week"] is not None else 0,
                digest_timezone=r["digest_timezone"] or "America/New_York",
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
    # Weekly recommendations helpers
    # ------------------------------------------------------------------
    def get_insights_for_week(self, source_ids: list[str], days: int = 7) -> list[Insight]:
        if not source_ids:
            return []
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT i.*, e.title AS episode_title, s.name AS source_name
                    FROM insights i
                    LEFT JOIN episodes e ON e.id = i.episode_id
                    LEFT JOIN sources s ON s.id = i.source_id
                    WHERE i.source_id = ANY(%s)
                      AND i.date >= (NOW() - make_interval(days => %s))::date
                    ORDER BY i.date DESC, i.created_at DESC
                    """,
                    (source_ids, days),
                )
                return [self._row_to_insight(r) for r in cur.fetchall()]

    def get_trending_sources(
        self,
        domains: list[str],
        exclude_ids: list[str],
        days: int = 7,
        limit: int = 5,
    ) -> list[dict]:
        """Returns sources not in exclude_ids ranked by insight count in the past `days` days."""
        with self._conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT s.id, s.name, s.domain, COUNT(i.id) AS insight_count
                    FROM sources s
                    JOIN insights i ON i.source_id = s.id
                    WHERE s.domain = ANY(%s)
                      AND s.id != ALL(%s)
                      AND s.deleted = FALSE
                      AND s.enabled = TRUE
                      AND i.date >= (NOW() - make_interval(days => %s))::date
                    GROUP BY s.id, s.name, s.domain
                    ORDER BY insight_count DESC
                    LIMIT %s
                    """,
                    (domains, exclude_ids or [], days, limit),
                )
                return [dict(r) for r in cur.fetchall()]

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
        def _maybe_dt(val) -> datetime | None:
            if val is None:
                return None
            return val if isinstance(val, datetime) else datetime.fromisoformat(str(val))

        return PodcastSource(
            id=row["id"], name=row["name"], url=row["url"],
            source_type=row["source_type"], domain=row["domain"],
            enabled=bool(row["enabled"]),
            created_at=row["created_at"] if isinstance(row["created_at"], datetime)
                       else datetime.fromisoformat(str(row["created_at"])),
            platform_links=raw_links,
            backoff_until=_maybe_dt(row.get("backoff_until")),
            fetch_error_count=int(row.get("fetch_error_count") or 0),
            platform_links_attempted_at=_maybe_dt(row.get("platform_links_attempted_at")),
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
