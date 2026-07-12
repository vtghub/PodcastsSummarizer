"""Gemini 2.0 Flash LLM provider — free tier, structured JSON output."""

import hashlib
import textwrap
import time
from datetime import datetime, timezone

import google.generativeai as genai

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import GEMINI_API_KEY, GEMINI_MODEL
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

# Cap at ~60k chars (~15k tokens) to stay within free tier rate limits.
# Sample first 75% + last 25% so episode conclusions aren't silently dropped
# on the rare transcript that still exceeds this after chunking is available —
# chunked_extract() below handles the normal long-transcript case instead.
_MAX_TRANSCRIPT_CHARS = 60_000
# Per-chunk budget when map-reduce kicks in — a bit under the single-call cap
# to leave headroom for the (smaller) chunk-summary prompt's own overhead.
_CHUNK_TARGET_CHARS = 50_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient 429/503 errors


class GeminiLLMProvider(LLMProvider):

    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")
        genai.configure(api_key=GEMINI_API_KEY)
        self._model = genai.GenerativeModel(GEMINI_MODEL)

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix="    [Gemini]",
                provider_name=GEMINI_MODEL,
            )
        else:
            prompt = textwrap.dedent(EXTRACTION_PROMPT).format(
                title=episode.title,
                domain=domain,
                description=episode.description[:500],
                transcript=transcript.text,
            )
            data = parse_json_response(self._generate_text(prompt))

        insight_id = hashlib.md5(f"{episode.id}:{datetime.now(timezone.utc).isoformat()}".encode()).hexdigest()
        date_str = episode.published_at.strftime("%Y-%m-%d")

        return Insight(
            id=insight_id,
            episode_id=episode.id,
            source_id=episode.source_id,
            domain=domain,
            date=date_str,
            summary=data.get("summary", ""),
            key_points=data.get("key_points", []),
            key_quotes=data.get("key_quotes", []),
            action_items=data.get("action_items", []),
            tags=data.get("tags", []),
            title_en=data.get("title_en", ""),
        )

    def _generate_text(self, prompt: str) -> str:
        """Call Gemini with retry-on-transient-error, returning raw response text."""
        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Gemini] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = self._model.generate_content(prompt)
                return response.text.strip()
            except Exception as e:
                msg = str(e).lower()
                # Quota exhaustion — don't retry, let the caller fall back to Groq
                if "resource_exhausted" in msg or "quota" in msg:
                    raise
                # Transient errors — retry
                if "429" in msg or "503" in msg or "rate" in msg or "unavailable" in msg:
                    last_exc = e
                    continue
                raise
        raise last_exc  # type: ignore[misc]
