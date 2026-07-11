"""Groq LLM provider — free tier, fast inference via Llama 3.3 70B."""

import hashlib
import textwrap
import time
from datetime import datetime, timezone

from groq import Groq

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import GROQ_API_KEY, GROQ_MODEL
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

# Groq free tier: 6,000 TPM. Prompt overhead ~1,500 tokens, cap a single-call
# transcript at ~16k chars (~4,000 tokens) to keep the request under 6,000
# tokens. Longer transcripts go through chunked_extract() below instead of
# being truncated — TPM still gates total throughput, so very long episodes
# just take longer (multiple paced requests), but no content is dropped.
_MAX_TRANSCRIPT_CHARS = 16_000
_CHUNK_TARGET_CHARS = 12_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient rate-limit errors


class GroqLLMProvider(LLMProvider):

    def __init__(self, model: str = GROQ_MODEL):
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")
        self._client = Groq(api_key=GROQ_API_KEY)
        # Different Groq models have independent quota buckets under the same
        # key — passing a different model gives the waterfall a distinct slot.
        self._model = model

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix="    [Groq]",
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
        """Call Groq with retry-on-transient-error, returning raw response text.

        No response_format=json_object here (unlike the old single-call path)
        since this is now shared with chunked_extract()'s plain-text
        chunk-summary calls — the EXTRACTION_PROMPT's own "return ONLY valid
        JSON" instruction plus parse_json_response's fence-stripping is
        enough, the same approach Gemini already relies on.
        """
        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Groq] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                )
                return response.choices[0].message.content.strip()
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "rate" in msg or "503" in msg or "unavailable" in msg:
                    last_exc = e
                    continue
                raise
        raise last_exc  # type: ignore[misc]
