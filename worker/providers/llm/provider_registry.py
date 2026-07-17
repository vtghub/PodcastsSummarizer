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


def _cerebras():
    from worker.providers.llm.cerebras_llm import CerebrasLLMProvider
    return CerebrasLLMProvider()


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

# Declared order is the default priority when no config row overrides it —
# fastest/most-generous free tier first.
PROVIDER_SLOTS: list[ProviderSlot] = [
    ProviderSlot("gemini", "Gemini 2.0 Flash", "GEMINI_API_KEY", _gemini),
    ProviderSlot("groq_8b", "Groq — Llama 3.1 8B", "GROQ_API_KEY", _groq_8b),
    ProviderSlot("groq_70b", "Groq — Llama 3.3 70B", "GROQ_API_KEY", _groq_70b),
    ProviderSlot("mistral", "Mistral Small", "MISTRAL_API_KEY", _mistral),
    ProviderSlot("together", "Together — Llama 3.1 8B", "TOGETHER_API_KEY", _together),
    ProviderSlot("cohere", "Cohere Command R", "COHERE_API_KEY", _cohere),
    ProviderSlot("cerebras", "Cerebras Llama 3.3 70B", "CEREBRAS_API_KEY", _cerebras),
    *[
        ProviderSlot(key, display_name, "OPENROUTER_API_KEY", _make_openrouter(model))
        for key, display_name, model in _OPENROUTER_MODELS
    ],
]


def build_enabled_slots(config: dict[str, dict]) -> list[ProviderSlot]:
    """
    Resolve PROVIDER_SLOTS against admin-configured enabled/priority
    overrides (from llm_provider_config), skipping any slot whose env var
    isn't actually set regardless of what the config says — a slot can't be
    enabled if there's no key for it. A slot with no config row falls back
    to enabled=True at its declared list position.
    """
    def is_enabled(slot: ProviderSlot) -> bool:
        override = config.get(slot.key)
        return override["enabled"] if override else True

    def priority(slot: ProviderSlot, index: int) -> int:
        override = config.get(slot.key)
        return override["priority"] if override else index

    usable = [s for s in PROVIDER_SLOTS if os.getenv(s.env_var) and is_enabled(s)]
    return sorted(usable, key=lambda s: priority(s, PROVIDER_SLOTS.index(s)))
