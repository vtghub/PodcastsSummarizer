"""Cerebras LLM provider — free tier, OpenAI-compatible REST (no SDK)."""

import hashlib
import textwrap
import time
from datetime import datetime, timezone

import requests

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import CEREBRAS_API_KEY, CEREBRAS_MODEL
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

# Conservative budget, matching the other free-tier adapters — Cerebras'
# published free-tier limits vary by model and change over time, so this
# errs on the side of a smaller safe request rather than assuming headroom.
_MAX_TRANSCRIPT_CHARS = 16_000
_CHUNK_TARGET_CHARS = 12_000
_RETRY_DELAYS = [4, 16, 64]  # seconds; only for transient rate-limit errors


def list_available_models() -> list[str]:
    """
    Queries Cerebras's own /v1/models catalog for whatever's currently
    available to this API key — unlike Groq/OpenRouter's model lists (fixed
    strings in provider_registry.py), Cerebras's free-tier lineup has
    changed shape before and there's no guarantee today's 3 models
    (gpt-oss-120b, gemma-3-31b, zai-glm-4.7) stay the same. Raises on any
    failure — network error, bad key, endpoint shape change — so the caller
    (provider_registry.py's discovery wrapper) can fall back to a small
    hardcoded default list instead of breaking the whole waterfall build.
    """
    if not CEREBRAS_API_KEY:
        raise ValueError("CEREBRAS_API_KEY is not set.")
    response = requests.get(
        "https://api.cerebras.ai/v1/models",
        headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}"},
        timeout=10,
    )
    response.raise_for_status()
    data = response.json().get("data", [])
    models = [m["id"] for m in data if m.get("id")]
    if not models:
        raise ValueError("Cerebras /v1/models returned no usable entries")
    return models


class CerebrasLLMProvider(LLMProvider):

    def __init__(self, model: str = CEREBRAS_MODEL):
        if not CEREBRAS_API_KEY:
            raise ValueError("CEREBRAS_API_KEY is not set. Add it to your .env file.")
        self._model = model

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix=f"    [Cerebras/{self._model}]",
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
        """Call Cerebras with retry-on-transient-error, returning raw response text."""
        last_exc: Exception | None = None
        for attempt, delay in enumerate([0] + _RETRY_DELAYS):
            if delay:
                print(f"    [Cerebras/{self._model}] retry {attempt}/{len(_RETRY_DELAYS)} in {delay}s…")
                time.sleep(delay)
            try:
                response = requests.post(
                    "https://api.cerebras.ai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {CEREBRAS_API_KEY}", "Content-Type": "application/json"},
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
                    if response.status_code == 429 or "quota" in body.lower() or "rate" in body.lower():
                        last_exc = RuntimeError(f"Cerebras/{self._model} {response.status_code}: {body[:300]}")
                        continue
                    raise RuntimeError(f"Cerebras/{self._model} {response.status_code}: {body[:300]}")
                data = response.json()
                return data["choices"][0]["message"]["content"].strip()
            except requests.RequestException as e:
                last_exc = e
                continue
        raise last_exc  # type: ignore[misc]
