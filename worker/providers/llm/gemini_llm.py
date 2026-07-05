"""Gemini 2.0 Flash LLM provider — free tier, structured JSON output."""

import hashlib
import json
import re
import textwrap
import time
from datetime import datetime, timezone

import google.generativeai as genai

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import GEMINI_API_KEY, GEMINI_MODEL

_EXTRACTION_PROMPT = """
You are an expert podcast analyst. Extract structured insights from the transcript below.

Return ONLY valid JSON matching this exact schema — no markdown, no commentary:
{{
  "summary": "<2-3 sentence overview of the episode>",
  "key_points": ["<insight 1>", "<insight 2>", ..., "<insight 5-7>"],
  "key_quotes": ["<memorable direct quote 1>", "<memorable direct quote 2>", "<memorable direct quote 3>"],
  "action_items": ["<actionable takeaway 1>", "<actionable takeaway 2>", "<actionable takeaway 3>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"]
}}

Episode title: {title}
Domain: {domain}
Description: {description}

Transcript:
{transcript}
"""

# Cap at ~60k chars (~15k tokens) to stay within free tier rate limits.
# Sample first 75% + last 25% so episode conclusions aren't silently dropped.
_MAX_TRANSCRIPT_CHARS = 60_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient 429/503 errors


class GeminiLLMProvider(LLMProvider):

    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")
        genai.configure(api_key=GEMINI_API_KEY)
        self._model = genai.GenerativeModel(GEMINI_MODEL)

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        truncated = _smart_truncate(transcript.text, _MAX_TRANSCRIPT_CHARS)

        prompt = textwrap.dedent(_EXTRACTION_PROMPT).format(
            title=episode.title,
            domain=domain,
            description=episode.description[:500],
            transcript=truncated,
        )

        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Gemini] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = self._model.generate_content(prompt)
                raw = response.text.strip()
                data = self._parse_json(raw)
                break
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
        else:
            raise last_exc  # type: ignore[misc]

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
        )

    @staticmethod
    def _parse_json(text: str) -> dict:
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw output:\n{text[:500]}")


def _smart_truncate(text: str, limit: int) -> str:
    """Keep first 75% + last 25% of the limit so episode endings aren't lost."""
    if len(text) <= limit:
        return text
    head = int(limit * 0.75)
    tail = limit - head
    return text[:head] + "\n[…transcript middle omitted…]\n" + text[-tail:]
