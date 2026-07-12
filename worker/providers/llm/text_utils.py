"""Shared response-parsing helpers used by every LLM provider."""

import json
import re

import json_repair


def parse_json_response(text: str) -> dict:
    """
    Parse a model's response as the JSON object our prompts ask for.
    Tolerates markdown code fences and surrounding prose (some models add
    commentary despite being told not to) by extracting the first {...} block.

    Falls back to json_repair when strict json.loads fails — the common
    real-world break here is a model emitting an unescaped quote or raw
    newline inside a string value (e.g. a direct podcast quote), which
    surfaces as "Expecting ',' delimiter", or a response truncated at the
    token limit mid-string ("Unterminated string"). json_repair recovers
    both by treating the JSON as best-effort rather than strict.
    """
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        try:
            repaired = json_repair.loads(text)
        except Exception:
            repaired = None
        if isinstance(repaired, dict) and repaired:
            return repaired
        raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw output:\n{text[:500]}")
