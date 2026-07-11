"""Ollama local LLM provider — fully offline, no API key needed."""

import hashlib
from datetime import datetime, timezone

import requests

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.config.settings import OLLAMA_BASE_URL, OLLAMA_MODEL
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract

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

Transcript:
{transcript}

Respond with ONLY the JSON object, starting with {{ and ending with }}.
"""

# Ollama is local/unlimited, but small local models lose coherence on very
# long single-shot contexts — chunk past this size rather than truncating.
_MAX_TRANSCRIPT_CHARS = 12_000
_CHUNK_TARGET_CHARS = 10_000


class OllamaLLMProvider(LLMProvider):

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.model = OLLAMA_MODEL

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._generate_text, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix="    [Ollama]",
            )
        else:
            user_msg = _USER_PROMPT.format(
                title=episode.title, domain=domain, transcript=transcript.text,
            )
            data = parse_json_response(self._generate_text(user_msg))

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

    def _generate_text(self, prompt: str) -> str:
        """Call Ollama, returning raw response text.

        No forced JSON mode/system prompt here (unlike the old single-call
        path) since this is shared with chunked_extract()'s plain-text
        chunk-summary calls too — each prompt's own instructions plus
        parse_json_response's fence/prose-stripping is enough for the JSON-expecting
        calls, the same approach the other providers use.
        """
        response = requests.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
            },
            timeout=300,
        )
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "").strip()

