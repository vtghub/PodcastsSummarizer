"""
Basic pipeline tests using mock providers.
Run with: pytest worker/tests/
"""

import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from worker.core.interfaces import Episode, Insight, PodcastSource, Transcript


def _make_source(**kw):
    return PodcastSource(
        id="src1", name="Test Pod", url="http://example.com/rss",
        source_type="rss", domain="Technology & AI", **kw
    )


def _make_episode(**kw):
    return Episode(
        id="ep1", source_id="src1", title="Test Episode",
        url="http://example.com/ep1.mp3",
        published_at=datetime.now(timezone.utc), **kw
    )


def _make_insight():
    return Insight(
        id="ins1", episode_id="ep1", source_id="src1",
        domain="Technology & AI", date="2026-07-04",
        summary="Great episode.", key_points=["Point 1"],
        key_quotes=["Quote 1"], action_items=["Do X"], tags=["AI"],
    )


class TestSQLiteStorage:
    def test_save_and_retrieve_source(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        source = _make_source()
        db.save_source(source)
        sources = db.get_sources()
        assert len(sources) == 1
        assert sources[0].name == "Test Pod"

    def test_episode_exists(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        ep = _make_episode()
        assert not db.episode_exists(ep.id)
        db.save_episode(ep)
        assert db.episode_exists(ep.id)

    def test_save_and_retrieve_insight(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        ins = _make_insight()
        db.save_insight(ins)
        results = db.get_insights_by_date("2026-07-04")
        assert len(results) == 1
        assert results[0].summary == "Great episode."
        assert results[0].key_points == ["Point 1"]

    def test_get_available_dates(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        dates = db.get_available_dates()
        assert "2026-07-04" in dates


class TestConsoleEmail:
    def test_send_digest_prints(self, capsys):
        from worker.providers.email.gmail_smtp import ConsoleEmailProvider
        email = ConsoleEmailProvider()
        ins = _make_insight()
        email.send_digest("test@example.com", "2026-07-04", {"Technology & AI": [ins]})
        captured = capsys.readouterr()
        assert "2026-07-04" in captured.out
        assert "Great episode." in captured.out
