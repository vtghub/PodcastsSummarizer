"""Shared LLM extraction prompt used by all providers."""

EXTRACTION_PROMPT = """
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
