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


# ── Chunked (map-reduce) extraction for long transcripts ──────────────────────

class TestChunking:

    def test_short_text_is_a_single_chunk(self):
        from worker.providers.llm.chunking import split_into_chunks
        text = "This is one short sentence. And another one."
        assert split_into_chunks(text, target_chars=1000) == [text]

    def test_splits_on_sentence_boundaries_near_target_size(self):
        from worker.providers.llm.chunking import split_into_chunks
        sentences = [f"Sentence number {i}." for i in range(50)]
        text = " ".join(sentences)
        chunks = split_into_chunks(text, target_chars=200)
        assert len(chunks) > 1
        # No content lost or duplicated across the split
        assert " ".join(chunks) == text
        # No chunk wildly exceeds the target (a little slack for the sentence
        # that tips it over is fine; it shouldn't be a multiple of target)
        assert all(len(c) <= 250 for c in chunks)

    def test_hard_splits_a_single_run_on_sentence_with_no_punctuation(self):
        from worker.providers.llm.chunking import split_into_chunks
        text = "word " * 2000  # one giant "sentence" — no . ! or ?
        chunks = split_into_chunks(text, target_chars=1000)
        assert len(chunks) > 1
        assert all(len(c) <= 1000 for c in chunks)

    def test_chunked_extract_calls_generate_once_per_chunk_plus_synthesis(self):
        from worker.providers.llm.chunking import chunked_extract

        episode = _make_episode(title="Long Episode")
        transcript_text = " ".join(f"Sentence {i}." for i in range(200))

        calls: list[str] = []

        def fake_generate(prompt: str) -> str:
            calls.append(prompt)
            if "Segment summaries (in chronological order):" in prompt:
                return '{"title_en": "Long Episode", "summary": "s", "key_points": [], "key_quotes": [], "action_items": [], "tags": []}'
            return "A dense summary of this segment."

        def fake_parse_json(text: str) -> dict:
            import json
            return json.loads(text)

        result = chunked_extract(
            fake_generate, fake_parse_json, episode, "Technology & AI",
            transcript_text, chunk_target_chars=200,
        )

        num_chunks = len(calls) - 1  # last call is the synthesis call
        assert num_chunks > 1  # actually needed to chunk given the target size
        assert result["title_en"] == "Long Episode"
        # The synthesis prompt should reference every chunk summary, not just one
        synthesis_prompt = calls[-1]
        assert synthesis_prompt.count("[Segment") == num_chunks

    def test_chunked_extract_single_chunk_still_synthesizes(self):
        from worker.providers.llm.chunking import chunked_extract

        episode = _make_episode(title="Short-ish Episode")
        transcript_text = "A short transcript that fits in one chunk."

        calls: list[str] = []

        def fake_generate(prompt: str) -> str:
            calls.append(prompt)
            if "Segment summaries (in chronological order):" in prompt:
                return '{"title_en": "Short-ish Episode", "summary": "s", "key_points": [], "key_quotes": [], "action_items": [], "tags": []}'
            return "Summary of the only segment."

        def fake_parse_json(text: str) -> dict:
            import json
            return json.loads(text)

        result = chunked_extract(
            fake_generate, fake_parse_json, episode, "Technology & AI",
            transcript_text, chunk_target_chars=10_000,
        )

        assert len(calls) == 2  # one chunk-summary call + one synthesis call
        assert result["summary"] == "s"


# ── Multi-provider waterfall ────────────────────────────────────────────────

class TestWaterfall:

    def test_falls_through_to_next_provider_on_failure(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        calls: list[str] = []

        def failing(prompt: str) -> str:
            calls.append("A")
            raise RuntimeError("quota exceeded")

        def working(prompt: str) -> str:
            calls.append("B")
            return "response from B"

        wf = WaterfallLLM([WaterfallStep("A", failing), WaterfallStep("B", working)])
        assert wf.generate("prompt") == "response from B"
        assert calls == ["A", "B"]

    def test_first_provider_used_when_it_succeeds(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        calls: list[str] = []

        def working(prompt: str) -> str:
            calls.append("A")
            return "response from A"

        def should_not_be_called(prompt: str) -> str:
            calls.append("B")
            return "response from B"

        wf = WaterfallLLM([WaterfallStep("A", working), WaterfallStep("B", should_not_be_called)])
        assert wf.generate("prompt") == "response from A"
        assert calls == ["A"]

    def test_raises_when_every_provider_fails(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        def failing(prompt: str) -> str:
            raise RuntimeError("exhausted")

        wf = WaterfallLLM([WaterfallStep("A", failing), WaterfallStep("B", failing)])
        with pytest.raises(RuntimeError, match="All 2 providers"):
            wf.generate("prompt")

    def test_empty_response_also_triggers_fallback(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        def empty(prompt: str) -> str:
            return ""

        def working(prompt: str) -> str:
            return "real response"

        wf = WaterfallLLM([WaterfallStep("A", empty), WaterfallStep("B", working)])
        assert wf.generate("prompt") == "real response"

    def test_requires_at_least_one_step(self):
        from worker.providers.llm.waterfall import WaterfallLLM
        with pytest.raises(ValueError):
            WaterfallLLM([])

    def test_failed_provider_is_not_retried_on_next_call(self):
        """A quota-exhausted provider shouldn't be re-attempted (and re-fail,
        eating its own retry/backoff time) on every subsequent chunk of the
        same run — once it fails, it's skipped for the rest of this
        WaterfallLLM instance's lifetime."""
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        calls: list[str] = []
        a_call_count = 0

        def failing(prompt: str) -> str:
            nonlocal a_call_count
            a_call_count += 1
            calls.append("A")
            raise RuntimeError("quota exceeded")

        def working(prompt: str) -> str:
            calls.append("B")
            return "response from B"

        wf = WaterfallLLM([WaterfallStep("A", failing), WaterfallStep("B", working)])

        # First call: A is tried (and fails), B succeeds.
        assert wf.generate("chunk 1") == "response from B"
        assert a_call_count == 1

        # Second call (simulating the next chunk): A must NOT be retried.
        assert wf.generate("chunk 2") == "response from B"
        assert a_call_count == 1  # unchanged
        assert calls == ["A", "B", "B"]

    def test_fresh_instance_has_no_memory_of_a_previous_runs_failures(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        def failing(prompt: str) -> str:
            raise RuntimeError("quota exceeded")

        wf1 = WaterfallLLM([WaterfallStep("A", failing)])
        with pytest.raises(RuntimeError):
            wf1.generate("prompt")

        # A brand new instance (next pipeline run) shouldn't inherit wf1's dead list.
        calls: list[str] = []

        def working_now(prompt: str) -> str:
            calls.append("A")
            return "A is back"

        wf2 = WaterfallLLM([WaterfallStep("A", working_now)])
        assert wf2.generate("prompt") == "A is back"
        assert calls == ["A"]

    def test_error_message_when_all_providers_already_marked_dead(self):
        from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep

        def failing(prompt: str) -> str:
            raise RuntimeError("quota exceeded")

        wf = WaterfallLLM([WaterfallStep("A", failing), WaterfallStep("B", failing)])
        with pytest.raises(RuntimeError, match="All 2 providers"):
            wf.generate("chunk 1")  # both fail and get marked dead

        # Second call: neither should even be attempted this time.
        with pytest.raises(RuntimeError, match="already marked"):
            wf.generate("chunk 2")


# ── LLM-backed weekly ranking ────────────────────────────────────────────────

class TestWaterfallRanking:
    """WaterfallLLMProvider.rank_insights() — LLM-backed selection with a
    heuristic fallback if the LLM call fails or returns something unusable."""

    def _provider_with_fake_waterfall(self, generate_fn):
        from worker.providers.llm.waterfall_llm import WaterfallLLMProvider
        provider = WaterfallLLMProvider.__new__(WaterfallLLMProvider)
        provider._waterfall = MagicMock()
        provider._waterfall.generate.side_effect = generate_fn
        return provider

    def test_uses_llm_ranked_order(self):
        insights = [_make_insight(id="a"), _make_insight(id="b"), _make_insight(id="c")]
        provider = self._provider_with_fake_waterfall(
            lambda prompt: '{"ranked_ids": ["c", "a"]}'
        )
        result = provider.rank_insights(insights, ["Technology & AI"], top_n=5)
        assert [i.id for i in result] == ["c", "a"]

    def test_caps_at_top_n(self):
        insights = [_make_insight(id=str(n)) for n in range(5)]
        provider = self._provider_with_fake_waterfall(
            lambda prompt: '{"ranked_ids": ["0", "1", "2", "3", "4"]}'
        )
        result = provider.rank_insights(insights, ["Technology & AI"], top_n=2)
        assert len(result) == 2

    def test_falls_back_to_heuristic_on_llm_failure(self):
        insights = [_make_insight(id="a", key_points=["p1"]),
                    _make_insight(id="b", key_points=["p1", "p2", "p3"])]

        def raises(prompt):
            raise RuntimeError("all providers exhausted")

        provider = self._provider_with_fake_waterfall(raises)
        result = provider.rank_insights(insights, ["Technology & AI"], top_n=5)
        assert [i.id for i in result] == ["b", "a"]  # richer insight first

    def test_falls_back_to_heuristic_on_unparseable_response(self):
        insights = [_make_insight(id="a", key_points=["p1"]),
                    _make_insight(id="b", key_points=["p1", "p2", "p3"])]
        provider = self._provider_with_fake_waterfall(lambda prompt: "not json at all")
        result = provider.rank_insights(insights, ["Technology & AI"], top_n=5)
        assert [i.id for i in result] == ["b", "a"]

    def test_falls_back_to_heuristic_when_ranked_ids_dont_match_candidates(self):
        insights = [_make_insight(id="a", key_points=["p1"]),
                    _make_insight(id="b", key_points=["p1", "p2", "p3"])]
        provider = self._provider_with_fake_waterfall(
            lambda prompt: '{"ranked_ids": ["nonexistent"]}'
        )
        result = provider.rank_insights(insights, ["Technology & AI"], top_n=5)
        assert [i.id for i in result] == ["b", "a"]

    def test_empty_insights_returns_empty_without_calling_llm(self):
        calls = []
        provider = self._provider_with_fake_waterfall(lambda prompt: calls.append(1) or "{}")
        assert provider.rank_insights([], ["Technology & AI"], top_n=5) == []
        assert calls == []


# ── Insight backfill job ─────────────────────────────────────────────────────

class TestBackfillInsights:

    def _make_storage(self, active_job=None, total=0, batch=None):
        storage = MagicMock()
        storage.get_active_backfill_job.return_value = active_job
        storage.count_insights.return_value = total
        storage.create_backfill_job.return_value = "job-1"
        storage.get_next_backfill_batch.return_value = batch or []
        storage.get_episode.side_effect = lambda eid: _make_episode(id=eid)
        storage.get_transcript.side_effect = lambda eid: Transcript(episode_id=eid, text="full transcript text")
        return storage

    def _fake_waterfall_llm(self, **kw):
        provider = MagicMock()
        provider.extract_insights.return_value = _make_insight(
            id="__will_be_overwritten__", summary="new improved summary", key_points=["new point"]
        )
        return provider

    def test_starts_new_job_when_none_active(self):
        from worker.jobs.backfill_insights import run_backfill
        ins = _make_insight(id="a")
        storage = self._make_storage(active_job=None, total=5, batch=[ins])

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage), \
             patch("worker.providers.llm.waterfall_llm.WaterfallLLMProvider", side_effect=self._fake_waterfall_llm):
            result = run_backfill(batch_size=10)

        storage.create_backfill_job.assert_called_once_with("insight_reextraction", total_items=5, batch_size=10)
        assert result["job_id"] == "job-1"
        assert result["succeeded"] == 1
        assert result["failed"] == 0

    def test_resumes_existing_active_job(self):
        from worker.jobs.backfill_insights import run_backfill
        ins = _make_insight(id="a")
        storage = self._make_storage(
            active_job={"id": "existing-job", "processed_items": 3, "total_items": 10},
            batch=[ins],
        )

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage), \
             patch("worker.providers.llm.waterfall_llm.WaterfallLLMProvider", side_effect=self._fake_waterfall_llm):
            result = run_backfill(batch_size=10)

        storage.create_backfill_job.assert_not_called()
        assert result["job_id"] == "existing-job"

    def test_empty_batch_completes_job(self):
        from worker.jobs.backfill_insights import run_backfill
        storage = self._make_storage(active_job={"id": "job-x", "processed_items": 10, "total_items": 10}, batch=[])

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage):
            result = run_backfill(batch_size=10)

        storage.complete_backfill_job.assert_called_once_with("job-x")
        assert result["completed"] is True

    def test_no_insights_and_no_active_job_is_a_noop(self):
        from worker.jobs.backfill_insights import run_backfill
        storage = self._make_storage(active_job=None, total=0)

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage):
            result = run_backfill(batch_size=10)

        storage.create_backfill_job.assert_not_called()
        assert result["completed"] is True

    def test_preserves_identity_fields_on_reextraction(self):
        from worker.jobs.backfill_insights import run_backfill
        original = _make_insight(id="orig-id", episode_id="ep-x", source_id="src-x", domain="Finance & Investing", date="2026-01-01")
        storage = self._make_storage(active_job=None, total=1, batch=[original])

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage), \
             patch("worker.providers.llm.waterfall_llm.WaterfallLLMProvider", side_effect=self._fake_waterfall_llm):
            run_backfill(batch_size=10)

        saved = storage.save_insight.call_args.args[0]
        assert saved.id == "orig-id"
        assert saved.episode_id == "ep-x"
        assert saved.source_id == "src-x"
        assert saved.domain == "Finance & Investing"
        assert saved.date == "2026-01-01"
        assert saved.summary == "new improved summary"  # content did change

    def test_missing_transcript_is_recorded_as_failure(self):
        from worker.jobs.backfill_insights import run_backfill
        ins = _make_insight(id="a", episode_id="ep-missing")
        storage = self._make_storage(active_job=None, total=1, batch=[ins])
        storage.get_transcript.side_effect = lambda eid: None

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage), \
             patch("worker.providers.llm.waterfall_llm.WaterfallLLMProvider", side_effect=self._fake_waterfall_llm):
            result = run_backfill(batch_size=10)

        storage.save_insight.assert_not_called()
        args, kwargs = storage.advance_backfill_cursor.call_args
        assert args[0] == "job-1"
        assert kwargs["success"] is False
        assert result["failed"] == 1

    def test_no_providers_configured_aborts_without_processing(self):
        from worker.jobs.backfill_insights import run_backfill
        ins = _make_insight(id="a")
        storage = self._make_storage(active_job=None, total=1, batch=[ins])

        with patch("worker.jobs.backfill_insights.get_storage_provider", return_value=storage), \
             patch("worker.providers.llm.waterfall_llm.WaterfallLLMProvider", side_effect=ValueError("no providers enabled")):
            result = run_backfill(batch_size=10)

        storage.save_insight.assert_not_called()
        storage.advance_backfill_cursor.assert_not_called()
        assert "error" in result


# ── Plug-in/plug-out provider registry ─────────────────────────────────────

class TestProviderRegistry:

    def test_slot_with_no_env_var_is_excluded_even_if_enabled(self, monkeypatch):
        from worker.providers.llm.provider_registry import build_enabled_slots, PROVIDER_SLOTS
        # Delete every slot's env var dynamically — hardcoding names here would
        # silently stop testing "no keys at all" as soon as a new slot with a
        # new env var is added (as happened when OPENROUTER_API_KEY was added
        # to .env but not to this list).
        for slot in PROVIDER_SLOTS:
            monkeypatch.delenv(slot.env_var, raising=False)
        assert build_enabled_slots({}) == []

    def test_default_order_matches_declared_list_when_env_vars_present(self, monkeypatch):
        from worker.providers.llm.provider_registry import build_enabled_slots, PROVIDER_SLOTS
        for slot in PROVIDER_SLOTS:
            monkeypatch.setenv(slot.env_var, "fake-key")
        slots = build_enabled_slots({})
        assert [s.key for s in slots] == [s.key for s in PROVIDER_SLOTS]

    def test_config_can_disable_a_slot(self, monkeypatch):
        from worker.providers.llm.provider_registry import build_enabled_slots, PROVIDER_SLOTS
        for slot in PROVIDER_SLOTS:
            monkeypatch.setenv(slot.env_var, "fake-key")
        config = {"gemini": {"enabled": False, "priority": 0}}
        slots = build_enabled_slots(config)
        assert "gemini" not in [s.key for s in slots]
        assert len(slots) == len(PROVIDER_SLOTS) - 1

    def test_config_can_reorder_slots(self, monkeypatch):
        from worker.providers.llm.provider_registry import build_enabled_slots, PROVIDER_SLOTS
        for slot in PROVIDER_SLOTS:
            monkeypatch.setenv(slot.env_var, "fake-key")
        # Push cohere to the very front
        config = {"cohere": {"enabled": True, "priority": -1}}
        slots = build_enabled_slots(config)
        assert slots[0].key == "cohere"

    def test_disabled_slot_without_key_is_still_excluded(self, monkeypatch):
        # A config row can't resurrect a provider with no API key configured
        from worker.providers.llm.provider_registry import build_enabled_slots
        monkeypatch.delenv("GEMINI_API_KEY", raising=False)
        config = {"gemini": {"enabled": True, "priority": 0}}
        slots = build_enabled_slots(config)
        assert "gemini" not in [s.key for s in slots]
