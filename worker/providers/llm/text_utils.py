"""Shared response-parsing helpers used by every LLM provider."""

import json
import re


def parse_json_response(text: str) -> dict:
    """
    Parse a model's response as the JSON object our prompts ask for.
    Tolerates markdown code fences and surrounding prose (some models add
    commentary despite being told not to) by extracting the first {...} block.
    """
    text = re.sub(r"^```(?:json)?\s*", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\s*```\s*$", "", text, flags=re.MULTILINE)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        text = match.group(0)
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"LLM returned invalid JSON: {e}\n\nRaw output:\n{text[:500]}")
