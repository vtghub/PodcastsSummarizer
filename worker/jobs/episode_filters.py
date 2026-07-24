"""
Cheap, pre-transcription heuristics for detecting episode-title variants —
foreign-language dubs and highlights/recap re-clips of an episode we already
have (or will have) in English — so the pipeline can skip them instead of
producing a redundant insight card for the same underlying content.

Both checks run on the raw RSS title alone, before any audio download,
transcription, or LLM call — the whole point is to filter before the
expensive work happens.
"""

import re
import unicodedata

_VARIANT_TITLE_RE = re.compile(
    r"^\s*(highlights?|recap|best\s*of|bonus|extra|clip|trailer)s?\s*[:\-–—]",
    re.IGNORECASE,
)


def is_recap_or_highlight_title(title: str) -> bool:
    """True for short-form re-clips like 'HIGHLIGHTS: <name>' or 'Recap: ...'."""
    return bool(_VARIANT_TITLE_RE.match(title or ""))


def is_likely_non_english_title(title: str) -> bool:
    """
    True when the majority of alphabetic characters in the title fall outside
    the Latin script (e.g. Devanagari, Cyrillic, Arabic) — a strong signal
    this is a translated/dubbed re-release rather than the original episode.
    """
    if not title:
        return False
    latin = 0
    other = 0
    for ch in title:
        if not ch.isalpha():
            continue
        try:
            name = unicodedata.name(ch)
        except ValueError:
            continue
        if "LATIN" in name:
            latin += 1
        else:
            other += 1
    total = latin + other
    if total == 0:
        return False
    return other / total > 0.5
