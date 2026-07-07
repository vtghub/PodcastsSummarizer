"""
Worker test suite — pipeline orchestration, storage, and provider logic.
Run with: pytest worker/tests/
"""

import pytest
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, call, patch

from worker.core.interfaces import Episode, Insight, PodcastSource, Transcript, UserDigestProfile


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _make_source(**kw) -> PodcastSource:
    defaults = dict(id="src1", name="Test Pod", url="http://example.com/rss",
                    source_type="rss", domain="Technology & AI")
    return PodcastSource(**{**defaults, **kw})


def _make_episode(**kw) -> Episode:
    defaults = dict(id="ep1", source_id="src1", title="Test Episode",
                    url="http://example.com/ep1.mp3",
                    published_at=datetime.now(timezone.utc))
    return Episode(**{**defaults, **kw})


def _make_insight(**kw) -> Insight:
    defaults = dict(id="ins1", episode_id="ep1", source_id="src1",
                    domain="Technology & AI", date="2026-07-07",
                    summary="Great episode.", key_points=["Point 1"],
                    key_quotes=["Quote 1"], action_items=["Do X"], tags=["AI"])
    return Insight(**{**defaults, **kw})


def _make_user(**kw) -> UserDigestProfile:
    defaults = dict(user_id="user1", email="user@example.com",
                    display_name="Alice", digest_hour=19)
    return UserDigestProfile(**{**defaults, **kw})


# ── SQLite storage ────────────────────────────────────────────────────────────

class TestSQLiteStorage:
    def test_save_and_retrieve_source(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        sources = db.get_sources()
        assert len(sources) == 1
        assert sources[0].name == "Test Pod"

    def test_episode_exists_only_after_done(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        ep = _make_episode()
        assert not db.episode_exists(ep.id)
        db.save_episode(ep)
        # save_episode sets status=pending; episode_exists requires status=done
        assert not db.episode_exists(ep.id)
        db.mark_episode_done(ep.id)
        assert db.episode_exists(ep.id)

    def test_save_and_retrieve_insight(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        results = db.get_insights_by_date("2026-07-07")
        assert len(results) == 1
        assert results[0].summary == "Great episode."
        assert results[0].key_points == ["Point 1"]

    def test_get_available_dates(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        assert "2026-07-07" in db.get_available_dates()

    def test_get_insights_by_date_and_sources(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        # subscribed source → returns insight
        results = db.get_insights_by_date_and_sources("2026-07-07", ["src1"])
        assert len(results) == 1
        # unsubscribed source → empty
        results = db.get_insights_by_date_and_sources("2026-07-07", ["other"])
        assert results == []

    def test_no_insights_for_wrong_date(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        assert db.get_insights_by_date("1999-01-01") == []

    def test_upsert_episode_queue_status(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.upsert_episode_queue_status("ep1", "src1", "pending")
        db.upsert_episode_queue_status("ep1", "src1", "done")

    def test_insight_overwrite_on_conflict(self, tmp_path):
        from worker.providers.storage.sqlite_storage import SQLiteStorage
        db = SQLiteStorage(db_path=tmp_path / "test.db")
        db.save_source(_make_source())
        db.save_episode(_make_episode())
        db.save_insight(_make_insight())
        db.save_insight(_make_insight(summary="Updated summary"))
        results = db.get_insights_by_date("2026-07-07")
        assert len(results) == 1
        assert results[0].summary == "Updated summary"


# ── StorageProvider base defaults ─────────────────────────────────────────────

class TestStorageProviderDefaults:
    """The abstract base provides no-op defaults — verify they don't raise."""

    def setup_method(self):
        from worker.core.interfaces import StorageProvider
        # Concrete stub that satisfies all abstractmethods
        class _Stub(StorageProvider):
            def save_source(self, s): pass
            def get_sources(self, enabled_only=True): return []
            def get_source(self, sid): return None
            def save_episode(self, e): pass
            def episode_exists(self, eid): return False
            def mark_episode_done(self, eid): pass
            def save_transcript(self, t): pass
            def save_insight(self, i): pass
            def get_insights_by_date(self, d): return []
            def get_insights_by_date_and_domain(self, d, dom): return []
            def get_available_dates(self): return []

        self.storage = _Stub()

    def test_get_users_default_empty(self):
        assert self.storage.get_users_with_digest_enabled() == []

    def test_get_subscriptions_default_empty(self):
        assert self.storage.get_user_subscribed_source_ids("uid") == []

    def test_get_insights_by_date_and_sources_empty_ids(self):
        assert self.storage.get_insights_by_date_and_sources("2026-07-07", []) == []

    def test_increment_retry_noop(self):
        self.storage.increment_episode_retry("ep1", "src1", datetime.now(timezone.utc))

    def test_update_backoff_noop(self):
        self.storage.update_source_backoff("src1", datetime.now(timezone.utc), 1)


# ── Email providers ───────────────────────────────────────────────────────────

class TestConsoleEmail:
    def test_send_digest_prints(self, capsys):
        from worker.providers.email.gmail_smtp import ConsoleEmailProvider
        email = ConsoleEmailProvider()
        ins = _make_insight()
        result = email.send_digest("test@example.com", "2026-07-07", {"Technology & AI": [ins]})
        captured = capsys.readouterr()
        assert "2026-07-07" in captured.out
        assert "Great episode." in captured.out
        assert result is True

    def test_send_digest_empty_domains(self, capsys):
        from worker.providers.email.gmail_smtp import ConsoleEmailProvider
        email = ConsoleEmailProvider()
        result = email.send_digest("test@example.com", "2026-07-07", {})
        assert result is True


# ── Pipeline fan-out logic ────────────────────────────────────────────────────

class TestEmailFanOut:
    """Test the per-user digest fan-out with mocked storage and email."""

    def _make_storage(self, users, source_ids_map, insights_map):
        storage = MagicMock()
        storage.get_users_with_digest_enabled.return_value = users
        storage.get_user_subscribed_source_ids.side_effect = lambda uid: source_ids_map.get(uid, [])
        storage.get_insights_by_date_and_sources.side_effect = (
            lambda date, sids: insights_map.get(tuple(sids), [])
        )
        return storage

    def test_sends_to_all_users(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com")
        u2 = _make_user(user_id="u2", email="b@x.com")
        ins = _make_insight()
        storage = self._make_storage(
            users=[u1, u2],
            source_ids_map={"u1": ["src1"], "u2": ["src1"]},
            insights_map={("src1",): [ins]},
        )
        email = MagicMock()
        email.send_digest.return_value = True

        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")

        assert email.send_digest.call_count == 2
        called_emails = {c.args[0] for c in email.send_digest.call_args_list}
        assert called_emails == {"a@x.com", "b@x.com"}

    def test_skips_user_with_no_subscriptions(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com")
        storage = self._make_storage(
            users=[u1],
            source_ids_map={},   # no subscriptions
            insights_map={},
        )
        email = MagicMock()
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")
        email.send_digest.assert_not_called()

    def test_skips_user_with_no_insights(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com")
        storage = self._make_storage(
            users=[u1],
            source_ids_map={"u1": ["src1"]},
            insights_map={("src1",): []},   # empty insights
        )
        email = MagicMock()
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")
        email.send_digest.assert_not_called()

    def test_digest_domains_filter_null_means_all(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com", digest_domains=None)
        ins_tech = _make_insight(domain="Technology & AI")
        ins_biz = _make_insight(id="ins2", domain="Business")
        storage = self._make_storage(
            users=[u1],
            source_ids_map={"u1": ["src1"]},
            insights_map={("src1",): [ins_tech, ins_biz]},
        )
        email = MagicMock()
        email.send_digest.return_value = True
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")
        by_domain = email.send_digest.call_args.args[2]
        assert "Technology & AI" in by_domain
        assert "Business" in by_domain

    def test_digest_domains_filter_list_restricts(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com", digest_domains=["Technology & AI"])
        ins_tech = _make_insight(domain="Technology & AI")
        ins_biz = _make_insight(id="ins2", domain="Business")
        storage = self._make_storage(
            users=[u1],
            source_ids_map={"u1": ["src1"]},
            insights_map={("src1",): [ins_tech, ins_biz]},
        )
        email = MagicMock()
        email.send_digest.return_value = True
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")
        by_domain = email.send_digest.call_args.args[2]
        assert "Technology & AI" in by_domain
        assert "Business" not in by_domain

    def test_continues_after_one_user_failure(self):
        from worker.jobs.pipeline import _send_per_user_digests
        u1 = _make_user(user_id="u1", email="a@x.com")
        u2 = _make_user(user_id="u2", email="b@x.com")
        ins = _make_insight()
        storage = self._make_storage(
            users=[u1, u2],
            source_ids_map={"u1": ["src1"], "u2": ["src1"]},
            insights_map={("src1",): [ins]},
        )
        email = MagicMock()
        email.send_digest.side_effect = [Exception("SMTP timeout"), True]
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email):
            _send_per_user_digests(storage, "2026-07-07")
        # Both users attempted despite first failure
        assert email.send_digest.call_count == 2

    def test_fallback_to_single_digest_when_no_users(self):
        from worker.jobs.pipeline import _send_per_user_digests
        storage = MagicMock()
        storage.get_users_with_digest_enabled.return_value = []
        email = MagicMock()
        with patch("worker.jobs.pipeline.get_email_provider", return_value=email), \
             patch("worker.jobs.pipeline._send_single_digest") as mock_single:
            _send_per_user_digests(storage, "2026-07-07")
        mock_single.assert_called_once()


# ── Pipeline resilience helpers (storage interface) ───────────────────────────

class TestPipelineResilience:
    """Verify retry/backoff logic via the storage interface contract."""

    def test_get_episodes_for_retry_default_empty(self):
        from worker.core.interfaces import StorageProvider

        class _Stub(StorageProvider):
            def save_source(self, s): pass
            def get_sources(self, e=True): return []
            def get_source(self, sid): return None
            def save_episode(self, e): pass
            def episode_exists(self, eid): return False
            def mark_episode_done(self, eid): pass
            def save_transcript(self, t): pass
            def save_insight(self, i): pass
            def get_insights_by_date(self, d): return []
            def get_insights_by_date_and_domain(self, d, dom): return []
            def get_available_dates(self): return []

        assert _Stub().get_episodes_for_retry() == []

    def test_is_quota_error_detects_resource_exhausted(self):
        from worker.jobs.pipeline import _is_quota_error
        assert _is_quota_error(Exception("RESOURCE_EXHAUSTED quota exceeded"))
        assert _is_quota_error(Exception("429 Too Many Requests"))
        assert not _is_quota_error(Exception("connection refused"))
        assert not _is_quota_error(Exception("500 Internal Server Error"))
