"""SQLite implementation of StorageProvider — default local backend."""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

from worker.core.interfaces import (
    Episode, Insight, PodcastSource, StorageProvider, Transcript,
)
from worker.config.settings import SQLITE_DB_PATH


class SQLiteStorage(StorageProvider):

    def __init__(self, db_path: Path = SQLITE_DB_PATH):
        self.db_path = db_path
        self._init_schema()

    @contextmanager
    def _conn(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self):
        with self._conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS sources (
                    id          TEXT PRIMARY KEY,
                    name        TEXT NOT NULL,
                    url         TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    domain      TEXT NOT NULL,
                    enabled     INTEGER NOT NULL DEFAULT 1,
                    deleted     INTEGER NOT NULL DEFAULT 0,
                    created_at  TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS episodes (
                    id               TEXT PRIMARY KEY,
                    source_id        TEXT NOT NULL,
                    title            TEXT NOT NULL,
                    title_en         TEXT,
                    url              TEXT NOT NULL,
                    published_at     TEXT NOT NULL,
                    duration_seconds INTEGER NOT NULL DEFAULT 0,
                    description      TEXT NOT NULL DEFAULT '',
                    fetched_at       TEXT NOT NULL,
                    status           TEXT NOT NULL DEFAULT 'pending',
                    FOREIGN KEY (source_id) REFERENCES sources(id)
                );

                CREATE TABLE IF NOT EXISTS transcripts (
                    episode_id  TEXT PRIMARY KEY,
                    text        TEXT NOT NULL,
                    language    TEXT NOT NULL DEFAULT 'en',
                    created_at  TEXT NOT NULL,
                    FOREIGN KEY (episode_id) REFERENCES episodes(id)
                );

                CREATE TABLE IF NOT EXISTS insights (
                    id           TEXT PRIMARY KEY,
                    episode_id   TEXT NOT NULL,
                    source_id    TEXT NOT NULL,
                    domain       TEXT NOT NULL,
                    date         TEXT NOT NULL,
                    summary      TEXT NOT NULL,
                    key_points   TEXT NOT NULL,
                    key_quotes   TEXT NOT NULL,
                    action_items TEXT NOT NULL,
                    tags         TEXT NOT NULL,
                    created_at   TEXT NOT NULL,
                    FOREIGN KEY (episode_id) REFERENCES episodes(id)
                );

                CREATE INDEX IF NOT EXISTS idx_insights_date   ON insights(date);
                CREATE INDEX IF NOT EXISTS idx_insights_domain ON insights(domain);
                CREATE INDEX IF NOT EXISTS idx_episodes_source ON episodes(source_id);
            """)
            # Databases created before title_en existed won't have picked it up
            # from CREATE TABLE IF NOT EXISTS above — add it defensively.
            try:
                conn.execute("ALTER TABLE episodes ADD COLUMN title_en TEXT")
                conn.commit()
            except sqlite3.OperationalError:
                pass  # column already exists

    # ------------------------------------------------------------------
    # Sources
    # ------------------------------------------------------------------
    def save_source(self, source: PodcastSource) -> None:
        with self._conn() as conn:
            conn.execute("""
                INSERT INTO sources (id, name, url, source_type, domain, enabled, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name, url=excluded.url, domain=excluded.domain,
                    enabled=excluded.enabled
            """, (
                source.id, source.name, source.url, source.source_type,
                source.domain, int(source.enabled), source.created_at.isoformat(),
            ))

    def get_sources(self, enabled_only: bool = True) -> list[PodcastSource]:
        with self._conn() as conn:
            if enabled_only:
                q = "SELECT * FROM sources WHERE enabled = 1 AND deleted = 0"
            else:
                q = "SELECT * FROM sources WHERE deleted = 0"
            rows = conn.execute(q).fetchall()
        return [self._row_to_source(r) for r in rows]

    def get_source(self, source_id: str) -> PodcastSource | None:
        with self._conn() as conn:
            row = conn.execute("SELECT * FROM sources WHERE id = ?", (source_id,)).fetchone()
        return self._row_to_source(row) if row else None

    # ------------------------------------------------------------------
    # Episodes
    # ------------------------------------------------------------------
    def save_episode(self, episode: Episode) -> None:
        with self._conn() as conn:
            conn.execute("""
                INSERT OR IGNORE INTO episodes
                (id, source_id, title, url, published_at, duration_seconds, description, fetched_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                episode.id, episode.source_id, episode.title, episode.url,
                episode.published_at.isoformat(), episode.duration_seconds,
                episode.description, episode.fetched_at.isoformat(),
            ))

    def episode_exists(self, episode_id: str) -> bool:
        """Returns True only for fully processed episodes (status='done')."""
        with self._conn() as conn:
            row = conn.execute(
                "SELECT 1 FROM episodes WHERE id = ? AND status = 'done'", (episode_id,)
            ).fetchone()
        return row is not None

    def find_duplicate_episode_id(self, source_id: str, title: str, published_at) -> str | None:
        with self._conn() as conn:
            row = conn.execute(
                """
                SELECT id FROM episodes
                WHERE source_id = ? AND title = ? AND published_at = ? AND status = 'done'
                LIMIT 1
                """,
                (source_id, title, published_at.isoformat()),
            ).fetchone()
        return row[0] if row else None

    def mark_episode_done(self, episode_id: str) -> None:
        with self._conn() as conn:
            conn.execute("UPDATE episodes SET status = 'done' WHERE id = ?", (episode_id,))

    def update_episode_title_en(self, episode_id: str, title_en: str) -> None:
        with self._conn() as conn:
            conn.execute("UPDATE episodes SET title_en = ? WHERE id = ?", (title_en, episode_id))

    # ------------------------------------------------------------------
    # Transcripts
    # ------------------------------------------------------------------
    def save_transcript(self, transcript: Transcript) -> None:
        with self._conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO transcripts (episode_id, text, language, created_at)
                VALUES (?, ?, ?, ?)
            """, (
                transcript.episode_id, transcript.text,
                transcript.language, transcript.created_at.isoformat(),
            ))

    # ------------------------------------------------------------------
    # Insights
    # ------------------------------------------------------------------
    def save_insight(self, insight: Insight) -> None:
        with self._conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO insights
                (id, episode_id, source_id, domain, date, summary,
                 key_points, key_quotes, action_items, tags, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                insight.id, insight.episode_id, insight.source_id,
                insight.domain, insight.date, insight.summary,
                json.dumps(insight.key_points),
                json.dumps(insight.key_quotes),
                json.dumps(insight.action_items),
                json.dumps(insight.tags),
                insight.created_at.isoformat(),
            ))

    def get_insights_by_date(self, date: str) -> list[Insight]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM insights WHERE date = ? ORDER BY domain, created_at",
                (date,)
            ).fetchall()
        return [self._row_to_insight(r) for r in rows]

    def get_insights_by_date_and_domain(self, date: str, domain: str) -> list[Insight]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM insights WHERE date = ? AND domain = ? ORDER BY created_at",
                (date, domain)
            ).fetchall()
        return [self._row_to_insight(r) for r in rows]

    def get_available_dates(self) -> list[str]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT DISTINCT date FROM insights ORDER BY date DESC"
            ).fetchall()
        return [r["date"] for r in rows]

    # ------------------------------------------------------------------
    # Row → dataclass helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _row_to_source(row: sqlite3.Row) -> PodcastSource:
        return PodcastSource(
            id=row["id"], name=row["name"], url=row["url"],
            source_type=row["source_type"], domain=row["domain"],
            enabled=bool(row["enabled"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    @staticmethod
    def _row_to_insight(row: sqlite3.Row) -> Insight:
        return Insight(
            id=row["id"], episode_id=row["episode_id"], source_id=row["source_id"],
            domain=row["domain"], date=row["date"], summary=row["summary"],
            key_points=json.loads(row["key_points"]),
            key_quotes=json.loads(row["key_quotes"]),
            action_items=json.loads(row["action_items"]),
            tags=json.loads(row["tags"]),
            created_at=datetime.fromisoformat(row["created_at"]),
        )
