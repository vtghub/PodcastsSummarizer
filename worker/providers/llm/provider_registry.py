"""
Canonical list of LLM provider "slots" the waterfall can draw from.

Adding a new provider TYPE (a new API to talk to) means adding an entry here
plus its LLMProvider-style class — that's a code change and a deploy. Which
of these known slots are actually ENABLED and in what ORDER is config, not
code: see the llm_provider_config Supabase table, editable from the
/admin/llm-providers dashboard page (no deploy needed for that part).

If there's no config row for a slot yet (or the config table can't be
reached — e.g. local SQLite dev), it falls back to enabled=True at this
list's declared order, so the waterfall still works out of the box.
"""

import os
import re
from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class ProviderSlot:
    key: str            # stable id — matches llm_provider_config.provider_key
    display_name: str
    env_var: str         # presence of this env var means the slot is usable
    build: Callable[[], object]  # returns an instance with a _generate_text(prompt) method


def _gemini():
    from worker.providers.llm.gemini_llm import GeminiLLMProvider
    return GeminiLLMProvider()


def _groq_8b():
    from worker.providers.llm.groq_llm import GroqLLMProvider
    from worker.config.settings import GROQ_MODEL
    return GroqLLMProvider(model=GROQ_MODEL)


def _groq_70b():
    from worker.providers.llm.groq_llm import GroqLLMProvider
    from worker.config.settings import GROQ_MODEL_70B
    return GroqLLMProvider(model=GROQ_MODEL_70B)


def _mistral():
    from worker.providers.llm.mistral_llm import MistralLLMProvider
    return MistralLLMProvider()


def _together():
    from worker.providers.llm.together_llm import TogetherLLMProvider
    return TogetherLLMProvider()


def _cohere():
    from worker.providers.llm.cohere_llm import CohereLLMProvider
    return CohereLLMProvider()


def _make_cerebras(model: str) -> Callable[[], object]:
    def _build():
        from worker.providers.llm.cerebras_llm import CerebrasLLMProvider
        return CerebrasLLMProvider(model=model)
    return _build


def _slugify_model_id(model_id: str) -> str:
    return "cerebras_" + re.sub(r"[^a-z0-9]+", "_", model_id.lower()).strip("_")


# Cerebras's free-tier catalog has changed shape before (unlike Groq's fixed
# 2 models or OpenRouter's fixed 4) — these are the 3 known at the time this
# was written (gpt-oss-120b is their "Production" tier; the other two are
# "Preview"), used only as a fallback when live discovery (below) can't run.
_CEREBRAS_FALLBACK_MODELS = [
    (_slugify_model_id("gpt-oss-120b"), "Gpt Oss 120B (Cerebras)", "gpt-oss-120b"),
    (_slugify_model_id("gemma-3-31b"), "Gemma 3 31B (Cerebras)", "gemma-3-31b"),
    (_slugify_model_id("zai-glm-4.7"), "Zai Glm 4.7 (Cerebras)", "zai-glm-4.7"),
]


def _discover_cerebras_slots() -> list[ProviderSlot]:
    """
    Queries Cerebras's live /v1/models catalog and returns one ProviderSlot
    per model found — so a new free model Cerebras adds shows up as a new
    waterfall fallback automatically, no code change needed. Falls back to
    _CEREBRAS_FALLBACK_MODELS (the 3 known at write time) if the key isn't
    set, the call fails, or the response is empty — a Cerebras outage or API
    change shouldn't be able to break every other provider's slot-building.
    Display names are auto-formatted from the model id (not hand-curated
    like OpenRouter's list), since we don't know what Cerebras will add next.
    """
    try:
        from worker.providers.llm.cerebras_llm import list_available_models
        model_ids = list_available_models()
        return [
            ProviderSlot(_slugify_model_id(m), f"{m.replace('-', ' ').title()} (Cerebras)", "CEREBRAS_API_KEY", _make_cerebras(m))
            for m in model_ids
        ]
    except Exception as e:
        print(f"[ProviderRegistry] Cerebras model discovery failed ({e}) — using fallback list")
        return [
            ProviderSlot(key, display_name, "CEREBRAS_API_KEY", _make_cerebras(model))
            for key, display_name, model in _CEREBRAS_FALLBACK_MODELS
        ]


def _make_openrouter(model: str) -> Callable[[], object]:
    def _build():
        from worker.providers.llm.openrouter_llm import OpenRouterLLMProvider
        return OpenRouterLLMProvider(model=model)
    return _build


# OpenRouter's free (":free"-suffixed) catalog rotates over time — these were
# confirmed live via the OpenRouter models API when added. If one of these
# stops existing or stops being free, its calls will just fail and the
# waterfall skips past it; update/replace the model string here to swap it
# for whatever's currently free. Deliberately excludes non-general-purpose
# free models seen at the same time (a content-safety classifier, a
# code-specialized model) — those aren't suited to summarization/extraction.
_OPENROUTER_MODELS = [
    ("openrouter_nemotron_ultra", "NVIDIA Nemotron 3 Ultra (OpenRouter)", "nvidia/nemotron-3-ultra-550b-a55b:free"),
    ("openrouter_nemotron_nano", "NVIDIA Nemotron 3 Nano (OpenRouter)", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"),
    ("openrouter_laguna_m", "Poolside Laguna M.1 (OpenRouter)", "poolside/laguna-m.1:free"),
    ("openrouter_hy3", "Tencent Hy3 (OpenRouter)", "tencent/hy3:free"),
]

def _static_prefix_slots() -> list[ProviderSlot]:
    return [
        ProviderSlot("gemini", "Gemini 2.0 Flash", "GEMINI_API_KEY", _gemini),
        ProviderSlot("groq_8b", "Groq — Llama 3.1 8B", "GROQ_API_KEY", _groq_8b),
        ProviderSlot("groq_70b", "Groq — Llama 3.3 70B", "GROQ_API_KEY", _groq_70b),
        ProviderSlot("mistral", "Mistral Small", "MISTRAL_API_KEY", _mistral),
        ProviderSlot("together", "Together — Llama 3.1 8B", "TOGETHER_API_KEY", _together),
        ProviderSlot("cohere", "Cohere Command R", "COHERE_API_KEY", _cohere),
    ]


def _openrouter_slots() -> list[ProviderSlot]:
    return [
        ProviderSlot(key, display_name, "OPENROUTER_API_KEY", _make_openrouter(model))
        for key, display_name, model in _OPENROUTER_MODELS
    ]


# Static snapshot for callers that just want "the known slots" without
# triggering network I/O — tests, the admin dashboard's mirror list, and any
# other import-time code. Cerebras here is always the fallback list, never
# live-discovered; build_enabled_slots() below is what actually resolves
# live Cerebras models for a real waterfall run. Declared order is the
# default priority when no config row overrides it — fastest/most-generous
# free tier first.
PROVIDER_SLOTS: list[ProviderSlot] = [
    *_static_prefix_slots(),
    *[
        ProviderSlot(key, display_name, "CEREBRAS_API_KEY", _make_cerebras(model))
        for key, display_name, model in _CEREBRAS_FALLBACK_MODELS
    ],
    *_openrouter_slots(),
]


def build_enabled_slots(config: dict[str, dict]) -> list[ProviderSlot]:
    """
    Resolve the full slot list — static providers plus Cerebras's live-
    discovered catalog (see _discover_cerebras_slots) — against admin-
    configured enabled/priority overrides (from llm_provider_config),
    skipping any slot whose env var isn't actually set regardless of what
    the config says. A slot with no config row falls back to enabled=True
    at its position in this run's declared order.
    """
    declared = [*_static_prefix_slots(), *_discover_cerebras_slots(), *_openrouter_slots()]

    def is_enabled(slot: ProviderSlot) -> bool:
        override = config.get(slot.key)
        return override["enabled"] if override else True

    def priority(slot: ProviderSlot, index: int) -> int:
        override = config.get(slot.key)
        return override["priority"] if override else index

    usable = [s for s in declared if os.getenv(s.env_var) and is_enabled(s)]
    return sorted(usable, key=lambda s: priority(s, declared.index(s)))
