"""Groq LLM provider — free tier, fast inference via Llama 3.3 70B."""

import hashlib
import json
import re
import textwrap
import time
from datetime import datetime, timezone

from groq import Groq

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import GROQ_API_KEY, GROQ_MODEL
from worker.providers.llm.prompts import EXTRACTION_PROMPT

# Groq free tier: 6,000 TPM. Prompt overhead ~1,500 tokens, cap transcript
# at ~16k chars (~4,000 tokens) to keep total request under 6,000 tokens.
_MAX_TRANSCRIPT_CHARS = 16_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient rate-limit errors


class GroqLLMProvider(LLMProvider):

    def __init__(self):
        if not GROQ_API_KEY:
            raise ValueError("GROQ_API_KEY is not set. Add it to your .env file.")
        self._client = Groq(api_key=GROQ_API_KEY)

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        truncated = transcript.text[:_MAX_TRANSCRIPT_CHARS]
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            truncated += "\n[transcript truncated for length]"

        prompt = textwrap.dedent(EXTRACTION_PROMPT).format(
            title=episode.title,
            domain=domain,
            description=episode.description[:500],
            transcript=truncated,
        )

        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Groq] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = self._client.chat.completions.create(
                    model=GROQ_MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content.strip()
                data = self._parse_json(raw)
                break
            except Exception as e:
                msg = str(e).lower()
                if "429" in msg or "rate" in msg or "503" in msg or "unavailable" in msg:
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
            title_en=data.get("title_en", ""),
        )

    @staticmethod
    def _parse_json(text: str) -> dict:
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw output:\n{text[:500]}")
