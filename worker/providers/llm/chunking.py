"""
Map-reduce extraction for transcripts too long to fit in a single LLM call.

Every provider used to hard-truncate long transcripts (Gemini kept head+tail,
Groq just cut off at a flat char count) — either way, content in the middle
or end of long episodes was silently dropped and never reached the model.

Instead: split the transcript into chunks, get a dense English summary of
each chunk (map), then synthesize the final structured Insight from those
summaries (reduce). Every provider still enforces its own free-tier request
budget per call — this only changes how many calls it takes to cover a whole
episode, never how much content is seen.
"""

import re
import textwrap
from typing import Callable

CHUNK_SUMMARY_PROMPT = """
You are analyzing one segment ({chunk_num} of {total_chunks}) of a longer podcast transcript.
Write a dense, factual summary of ONLY this segment in ENGLISH, regardless of what language
the transcript is in. Include specific facts, named entities, numbers, and 1-2 direct quotes
worth remembering (translate them faithfully if the transcript isn't in English — translate,
don't paraphrase). Do not summarize the whole episode, only this segment. Do not add
commentary about it being a segment or reference "this segment" in the output. Write plain
text, not JSON, 150-300 words.

Episode title: {title}
Domain: {domain}
Segment {chunk_num} of {total_chunks}:
{chunk}
"""

SYNTHESIS_PROMPT = """
You are an expert podcast analyst. Below are dense English summaries of consecutive segments
that together cover an entire podcast episode, in chronological order. Synthesize them into
ONE final set of insights for the whole episode, exactly as if you had read the full
transcript yourself. Draw key_points, key_quotes, and action_items from across ALL segments,
not just the first one — this episode has {total_chunks} segments in total.

Return ONLY valid JSON matching this exact schema — no markdown, no commentary:
{{
  "title_en": "<the episode title translated into English; if it's already in English, repeat it as-is>",
  "summary": "<2-3 sentence overview of the whole episode>",
  "key_points": ["<insight 1>", "<insight 2>", ..., "<insight 5-7>"],
  "key_quotes": ["<memorable direct quote 1>", "<memorable direct quote 2>", "<memorable direct quote 3>"],
  "action_items": ["<actionable takeaway 1>", "<actionable takeaway 2>", "<actionable takeaway 3>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"]
}}

Episode title: {title}
Domain: {domain}
Description: {description}

Segment summaries (in chronological order):
{summaries}
"""


def split_into_chunks(text: str, target_chars: int) -> list[str]:
    """Split on sentence boundaries, packing sentences up to ~target_chars per chunk."""
    if len(text) <= target_chars:
        return [text]

    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if current and len(current) + len(sentence) + 1 > target_chars:
            chunks.append(current.strip())
            current = sentence
        else:
            current = f"{current} {sentence}".strip() if current else sentence
    if current:
        chunks.append(current.strip())

    # Defensive: a "sentence" longer than target_chars (e.g. transcript with no
    # punctuation) would otherwise produce one oversized chunk — hard-split it.
    final_chunks: list[str] = []
    for chunk in chunks:
        if len(chunk) <= target_chars:
            final_chunks.append(chunk)
        else:
            for i in range(0, len(chunk), target_chars):
                final_chunks.append(chunk[i : i + target_chars])
    return final_chunks


def chunked_extract(
    generate: Callable[[str], str],
    parse_json: Callable[[str], dict],
    episode,
    domain: str,
    transcript_text: str,
    chunk_target_chars: int,
    log_prefix: str = "",
    provider_name: str | Callable[[], str] = "unknown",
) -> dict:
    """
    Map-reduce a long transcript into the same JSON shape a single-call
    extraction would produce. `generate` and `parse_json` are provider-specific
    (API call + retry handling, and response JSON parsing respectively) —
    this function only orchestrates the chunking/synthesis flow.

    `provider_name` identifies which model handled each call, for the admin
    Task Status page's per-chunk detail (see log_extraction_chunk()). Pass a
    static string for a single fixed provider, or a callable (e.g. reading
    WaterfallLLM.last_provider after each generate() call) when the actual
    provider can vary per chunk, as it does inside a waterfall.
    """
    chunks = split_into_chunks(transcript_text, chunk_target_chars)
    if log_prefix:
        print(f"{log_prefix} transcript too long for one call — {len(chunks)} chunks")

    def _resolve_provider() -> str:
        return provider_name() if callable(provider_name) else provider_name

    def _log(chunk_index: int, phase: str, status: str, error_msg: str | None) -> None:
        try:
            from worker.core.registry import get_storage_provider
            get_storage_provider().log_extraction_chunk(
                episode_id=episode.id, source_id=episode.source_id,
                chunk_index=chunk_index, total_chunks=len(chunks), phase=phase,
                provider_name=_resolve_provider(), status=status, error_msg=error_msg,
            )
        except Exception:
            pass  # logging is best-effort — never let it break extraction

    summaries: list[str] = []
    for i, chunk in enumerate(chunks):
        prompt = textwrap.dedent(CHUNK_SUMMARY_PROMPT).format(
            chunk_num=i + 1,
            total_chunks=len(chunks),
            title=episode.title,
            domain=domain,
            chunk=chunk,
        )
        try:
            result = generate(prompt).strip()
        except Exception as e:
            _log(i + 1, "summary", "failed", str(e)[:500])
            raise
        summaries.append(result)
        _log(i + 1, "summary", "success", None)

    combined = "\n\n---\n\n".join(
        f"[Segment {i + 1}/{len(chunks)}]\n{s}" for i, s in enumerate(summaries)
    )
    synth_prompt = textwrap.dedent(SYNTHESIS_PROMPT).format(
        title=episode.title,
        domain=domain,
        description=episode.description[:500],
        summaries=combined,
        total_chunks=len(chunks),
    )
    try:
        raw = generate(synth_prompt)
    except Exception as e:
        _log(len(chunks), "synthesis", "failed", str(e)[:500])
        raise
    _log(len(chunks), "synthesis", "success", None)
    return parse_json(raw)
