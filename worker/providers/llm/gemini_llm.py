"""Gemini 2.0 Flash LLM provider — free tier, structured JSON output."""

import hashlib
import json
import re
import textwrap
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

# Maximum characters sent to the LLM — Gemini Flash handles up to ~1M tokens,
# but we cap at ~60k chars (~15k tokens) to stay well within free tier rate limits.
_MAX_TRANSCRIPT_CHARS = 60_000


class GeminiLLMProvider(LLMProvider):

    def __init__(self):
        if not GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")
        genai.configure(api_key=GEMINI_API_KEY)
        self._model = genai.GenerativeModel(GEMINI_MODEL)

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        truncated = transcript.text[:_MAX_TRANSCRIPT_CHARS]
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            truncated += "\n[transcript truncated for length]"

        prompt = textwrap.dedent(_EXTRACTION_PROMPT).format(
            title=episode.title,
            domain=domain,
            description=episode.description[:500],
            transcript=truncated,
        )

        response = self._model.generate_content(prompt)
        raw = response.text.strip()
        data = self._parse_json(raw)

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
        # Strip possible markdown code fences
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.MULTILINE)
        text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw output:\n{text[:500]}")
