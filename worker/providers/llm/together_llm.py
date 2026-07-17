"""Together AI LLM provider — free tier, OpenAI-compatible REST (no SDK)."""

import hashlib
import textwrap
import time
from datetime import datetime, timezone

import requests

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import TOGETHER_API_KEY, TOGETHER_MODEL
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

# Conservative budget, matching the other free-tier adapters.
_MAX_TRANSCRIPT_CHARS = 16_000
_CHUNK_TARGET_CHARS = 12_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient rate-limit errors


class TogetherLLMProvider(LLMProvider):

    def __init__(self):
        if not TOGETHER_API_KEY:
            raise ValueError("TOGETHER_API_KEY is not set. Add it to your .env file.")

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix="    [Together]",
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
        """Call Together with retry-on-transient-error, returning raw response text."""
        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Together] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = requests.post(
                    "https://api.together.xyz/v1/chat/completions",
                    headers={"Authorization": f"Bearer {TOGETHER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": TOGETHER_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 2048,
                        "temperature": 0.3,
                    },
                    timeout=120,
                )
                body = response.text
                if not response.ok:
                    if response.status_code == 429 or "quota" in body.lower() or "rate" in body.lower():
                        last_exc = RuntimeError(f"Together {response.status_code}: {body[:300]}")
                        continue
                    raise RuntimeError(f"Together {response.status_code}: {body[:300]}")
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except requests.RequestException as e:
                last_exc = e
                continue
        raise last_exc  # type: ignore[misc]
