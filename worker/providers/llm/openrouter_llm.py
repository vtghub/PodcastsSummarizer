"""OpenRouter LLM provider — free tier via ":free"-suffixed models, plain REST.

OpenAI-compatible endpoint, so this is structurally the same as Mistral's/
Cohere's REST providers. Parametrized by model (like GroqLLMProvider) since
OpenRouter hosts several free models under one key — each becomes its own
PROVIDER_SLOT with an independent rate limit, not just a config alternative.
"""

import hashlib
import textwrap
import time
from datetime import datetime, timezone

import requests

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import OPENROUTER_API_KEY
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

# OpenRouter's free models are individually rate-limited (roughly ~20
# req/min per model at the time this was written — verify current limits at
# openrouter.ai/docs if extraction starts failing more than expected).
# Conservative sizing, same reasoning as Mistral/Cohere's.
_MAX_TRANSCRIPT_CHARS = 16_000
_CHUNK_TARGET_CHARS = 12_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient rate-limit errors


class OpenRouterLLMProvider(LLMProvider):

    def __init__(self, model: str):
        if not OPENROUTER_API_KEY:
            raise ValueError("OPENROUTER_API_KEY is not set. Add it to your .env file.")
        self._model = model

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix=f"    [OpenRouter/{self._model}]",
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
        """Call OpenRouter with retry-on-transient-error, returning raw response text."""
        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [OpenRouter/{self._model}] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = requests.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"},
                    json={
                        "model": self._model,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 2048,
                        "temperature": 0.3,
                    },
                    timeout=120,
                )
                body = response.text
                if not response.ok:
                    if response.status_code == 429 or "rate" in body.lower() or "quota" in body.lower():
                        last_exc = RuntimeError(f"OpenRouter/{self._model} {response.status_code}: {body[:300]}")
                        continue
                    raise RuntimeError(f"OpenRouter/{self._model} {response.status_code}: {body[:300]}")
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except requests.RequestException as e:
                last_exc = e
                continue
        raise last_exc  # type: ignore[misc]
