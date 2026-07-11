"""Ollama local LLM provider — fully offline, no API key needed."""

import hashlib
import json
import re
from datetime import datetime, timezone

import requests

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import OLLAMA_BASE_URL, OLLAMA_MODEL

_SYSTEM_PROMPT = (
    "You are a JSON-only API. You must respond with a single valid JSON object. "
    "No explanations, no markdown, no code fences — just the JSON object."
)

_USER_PROMPT = """\
Extract insights from this podcast transcript and return a JSON object with exactly these keys:
- title_en: string (the episode title translated into English; if it's already English, repeat it as-is)
- summary: string (2-3 sentences about the episode)
- key_points: array of 5-7 strings (main insights)
- key_quotes: array of 3 strings (memorable direct quotes from the transcript)
- action_items: array of 3 strings (actionable takeaways)
- tags: array of 3-5 strings (topic tags)

Write title_en, summary, key_points, key_quotes, action_items, and tags in ENGLISH,
regardless of what language the transcript or episode title are in. Translate rather
than transliterate — key_quotes should be a faithful English translation of the
original quote if the transcript isn't in English, not a transcription of foreign text.

Episode title: {title}
Domain: {domain}

Transcript (first {chars} characters):
{transcript}

Respond with ONLY the JSON object, starting with {{ and ending with }}.
"""

_MAX_TRANSCRIPT_CHARS = 12_000


class OllamaLLMProvider(LLMProvider):

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.model = OLLAMA_MODEL

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        truncated = transcript.text[:_MAX_TRANSCRIPT_CHARS]

        user_msg = _USER_PROMPT.format(
            title=episode.title,
            domain=domain,
            chars=len(truncated),
            transcript=truncated,
        )

        # Use /api/chat with a system role for better instruction following
        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                "stream": False,
                "format": "json",       # Ollama JSON mode — forces valid JSON output
            },
            timeout=300,
        )
        response.raise_for_status()
        raw = response.json().get("message", {}).get("content", "").strip()
        data = self._parse_json(raw)

        insight_id = hashlib.md5(
            f"{episode.id}:{datetime.now(timezone.utc).isoformat()}".encode()
        ).hexdigest()
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
        # Strip possible markdown fences just in case
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
        # Extract first JSON object if surrounded by prose
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            text = m.group(0)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"Ollama returned invalid JSON: {e}\n\nRaw:\n{text[:500]}")
