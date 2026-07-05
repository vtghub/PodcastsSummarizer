"""
Shared utilities for extracting plain text from various transcript formats.
Used by both RSS and YouTube source providers.
"""

import re
import html


def vtt_to_text(vtt: str) -> str:
    """Convert WebVTT subtitle file to clean plain text."""
    lines = []
    for line in vtt.splitlines():
        line = line.strip()
        # Skip header, timing lines, NOTE blocks, blank lines
        if (not line
                or line.startswith("WEBVTT")
                or line.startswith("NOTE")
                or "-->" in line
                or re.match(r"^\d+$", line)):
            continue
        # Strip VTT inline tags like <00:00:01.000>, <c>, </c>
        line = re.sub(r"<[^>]+>", "", line)
        line = line.strip()
        if line:
            lines.append(line)

    # Deduplicate consecutive identical lines (common in auto-captions)
    deduped = []
    prev = None
    for line in lines:
        if line != prev:
            deduped.append(line)
        prev = line

    return " ".join(deduped)


def srt_to_text(srt: str) -> str:
    """Convert SRT subtitle file to clean plain text."""
    lines = []
    for line in srt.splitlines():
        line = line.strip()
        if (not line
                or re.match(r"^\d+$", line)
                or "-->" in line):
            continue
        # Strip HTML-like tags sometimes present in SRT
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line:
            lines.append(line)
    return " ".join(lines)


def html_to_text(markup: str) -> str:
    """Strip HTML tags and decode entities to plain text."""
    # Remove script/style blocks
    markup = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", markup, flags=re.DOTALL | re.IGNORECASE)
    # Replace block-level tags with newlines
    markup = re.sub(r"<(br|p|div|li|h[1-6])[^>]*>", "\n", markup, flags=re.IGNORECASE)
    # Strip remaining tags
    markup = re.sub(r"<[^>]+>", "", markup)
    # Decode HTML entities
    markup = html.unescape(markup)
    # Collapse whitespace
    markup = re.sub(r"\n{3,}", "\n\n", markup)
    markup = re.sub(r"[ \t]+", " ", markup)
    return markup.strip()


def detect_and_convert(raw: str, mime_type: str = "") -> str:
    """Auto-detect format by content and convert to plain text."""
    stripped = raw.strip()
    mime = mime_type.lower()

    if "WEBVTT" in stripped[:20] or mime in ("text/vtt", "application/x-subrip"):
        return vtt_to_text(stripped)

    if re.match(r"^\d+\s*\n\d{2}:\d{2}", stripped) or mime == "application/x-subrip":
        return srt_to_text(stripped)

    if stripped.startswith("<") and ("<html" in stripped[:200].lower() or "<p" in stripped[:200].lower()):
        return html_to_text(stripped)

    # Plain text — return as-is
    return stripped
