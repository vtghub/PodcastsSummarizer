"""Shared LLM extraction prompt used by all providers."""

EXTRACTION_PROMPT = """
You are an expert podcast analyst. Extract structured insights from the transcript below.

Write summary, key_points, key_quotes, action_items, tags, and title_en in ENGLISH,
regardless of what language the transcript or episode title are in. Translate rather
than transliterate — key_quotes should be a faithful English translation of the
original quote if the transcript isn't in English, not a transcription of foreign text.

Return ONLY valid JSON matching this exact schema — no markdown, no commentary:
{{
  "title_en": "<the episode title translated into English; if it's already in English, repeat it as-is>",
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
