"""
LLMProvider that chains free-tier providers into one waterfall (see
waterfall.py), so exhausting one provider's quota doesn't stop the pipeline
— it falls through to the next provider, per chunk-call rather than per
whole episode.

Set LLM_PROVIDER=waterfall to use this. Which providers are active and in
what order is controlled by the /admin/llm-providers dashboard page (backed
by the llm_provider_config table) — see provider_registry.py for the full
list of providers this can draw from and how config is resolved. A provider
also needs its API key env var actually set to be usable, regardless of
what the config says.
"""

import hashlib
import textwrap
from datetime import datetime, timezone

from worker.core.interfaces import Episode, Insight, LLMProvider, Transcript
from worker.providers.llm.prompts import EXTRACTION_PROMPT
from worker.providers.llm.text_utils import parse_json_response
from worker.providers.llm.chunking import chunked_extract
from worker.providers.llm.waterfall import WaterfallLLM, WaterfallStep
from worker.providers.llm.provider_registry import build_enabled_slots

# Smallest safe per-chunk budget across all included providers, so any chunk
# can be handled by whichever provider ends up processing it. Gemini alone
# could take much more (50k), but the chain is only as generous as its
# tightest member for any given chunk.
_MAX_TRANSCRIPT_CHARS = 16_000
_CHUNK_TARGET_CHARS = 12_000


def _build_steps() -> list[WaterfallStep]:
    from worker.core.registry import get_storage_provider
    config = get_storage_provider().get_llm_provider_config()
    slots = build_enabled_slots(config)
    return [WaterfallStep(slot.display_name, slot.build()._generate_text) for slot in slots]


class WaterfallLLMProvider(LLMProvider):

    def __init__(self):
        steps = _build_steps()
        if not steps:
            raise ValueError(
                "No LLM providers are both enabled and have an API key set. Check "
                "the /admin/llm-providers page and your environment variables."
            )
        print(f"[Waterfall] configured with {len(steps)} provider(s): {', '.join(s.name for s in steps)}")
        self._waterfall = WaterfallLLM(steps)

    def extract_insights(self, episode: Episode, transcript: Transcript, domain: str) -> Insight:
        if len(transcript.text) > _MAX_TRANSCRIPT_CHARS:
            data = chunked_extract(
                self._waterfall.generate, parse_json_response, episode, domain,
                transcript.text, _CHUNK_TARGET_CHARS, log_prefix="    [Waterfall]",
            )
        else:
            prompt = textwrap.dedent(EXTRACTION_PROMPT).format(
                title=episode.title,
                domain=domain,
                description=episode.description[:500],
                transcript=transcript.text,
            )
            data = parse_json_response(self._waterfall.generate(prompt))

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
            title_en=data.get("title_en", ""),
        )
