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

Free-tier model lineups churn every few months. The model ids below were
verified against each provider's live catalog AND a real request on
2026-10-16 (see worker/config/settings.py for the same note). A retired model
just fails inside the waterfall and is skipped — silently — so a stale entry
degrades the ladder without any error surfacing; re-verify periodically.
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
    from worker.config.settings import GEMINI_MODEL
    return GeminiLLMProvider(model=GEMINI_MODEL)


def _gemini_lite():
    from worker.providers.llm.gemini_llm import GeminiLLMProvider
    from worker.config.settings import GEMINI_MODEL_LITE
    return GeminiLLMProvider(model=GEMINI_MODEL_LITE)


def _groq_primary():
    from worker.providers.llm.groq_llm import GroqLLMProvider
    from worker.config.settings import GROQ_MODEL
    return GroqLLMProvider(model=GROQ_MODEL)


def _groq_qwen():
    from worker.providers.llm.groq_llm import GroqLLMProvider
    from worker.config.settings import GROQ_MODEL_QWEN
    return GroqLLMProvider(model=GROQ_MODEL_QWEN)


def _groq_small():
    from worker.providers.llm.groq_llm import GroqLLMProvider
    from worker.config.settings import GROQ_MODEL_SMALL
    return GroqLLMProvider(model=GROQ_MODEL_SMALL)


def _mistral():
    from worker.providers.llm.mistral_llm import MistralLLMProvider
    from worker.config.settings import MISTRAL_MODEL
    return MistralLLMProvider(model=MISTRAL_MODEL)


def _mistral_2():
    from worker.providers.llm.mistral_llm import MistralLLMProvider
    from worker.config.settings import MISTRAL_MODEL_2
    return MistralLLMProvider(model=MISTRAL_MODEL_2)


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


# Cerebras is NOT a free tier any more (since July 2026: a one-time $5 promo
# credit that needs a card on file, expires after 30 days, and never auto-bills
# — once spent, calls just fail). It's kept as the LAST rung of the ladder so
# trial credit is only spent after every genuinely-free provider is exhausted.
# Its catalog has also changed shape before (zai-glm-4.7 was deprecated
# 2026-08-17), hence live discovery below; this fallback is used only when
# discovery can't run, and lists just the one "Production"-tier model.
_CEREBRAS_FALLBACK_MODELS = [
    (_slugify_model_id("gpt-oss-120b"), "GPT-OSS 120B (Cerebras trial credit)", "gpt-oss-120b"),
]


def _discover_cerebras_slots() -> list[ProviderSlot]:
    """
    Queries Cerebras's live /v1/models catalog and returns one ProviderSlot
    per model found — so a new model Cerebras adds shows up as a new
    waterfall fallback automatically, no code change needed. Falls back to
    _CEREBRAS_FALLBACK_MODELS if the key isn't set, the call fails, or the
    response is empty — a Cerebras outage or API change shouldn't be able to
    break every other provider's slot-building. Display names are
    auto-formatted from the model id (not hand-curated like OpenRouter's
    list), since we don't know what Cerebras will add next.
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


# OpenRouter's free (":free"-suffixed) catalog rotates constantly — of the four
# models originally listed here, two vanished from the free catalog within
# months (tencent/hy3:free now redirects to its PAID slug, which would bill
# OpenRouter credits if called) and a third started returning provider errors.
# Every model string here MUST end in ":free" (or be the free router below);
# a test enforces that so a paid slug can't sneak onto a "free" ladder.
#
# `openrouter/free` is OpenRouter's own free-model router: it picks whichever
# free model is currently available, so it survives the catalog churn that
# kills individual slugs — hence it's the last OpenRouter rung.
#
# Verified against the live catalog + a real extraction-style request on
# 2026-10-16. Deliberately excluded: non-general-purpose free models (content-
# safety classifier, music, code-specialised), models that returned empty or
# provider errors, and "agentic-harness-only" models.
#
# NOTE: OpenRouter's free-model daily request cap (50/day, or 1,000/day once
# $10 of credit has been purchased) appears to be one pooled counter across
# ALL :free models on the account — so these slots add availability/diversity,
# not extra daily quota. Treat OpenRouter as a thin safety net.
_OPENROUTER_MODELS = [
    ("openrouter_laguna_s", "Poolside Laguna S 2.1 (OpenRouter)", "poolside/laguna-s-2.1:free"),
    ("openrouter_nemotron_super", "NVIDIA Nemotron 3 Super (OpenRouter)", "nvidia/nemotron-3-super-120b-a12b:free"),
    ("openrouter_free", "OpenRouter Free Router", "openrouter/free"),
]


def _static_prefix_slots() -> list[ProviderSlot]:
    # Order = default priority when no config row overrides it: best quality +
    # most reliable first, interleaved across providers so one provider's rate
    # limit doesn't leave several consecutive rungs dead for the run.
    return [
        ProviderSlot("gemini", "Gemini 3.5 Flash", "GEMINI_API_KEY", _gemini),
        ProviderSlot("groq_gpt_oss_120b", "Groq — GPT-OSS 120B", "GROQ_API_KEY", _groq_primary),
        ProviderSlot("groq_qwen_27b", "Groq — Qwen3.8 27B", "GROQ_API_KEY", _groq_qwen),
        ProviderSlot("cohere", "Cohere Command A+", "COHERE_API_KEY", _cohere),
        ProviderSlot("mistral", "Mistral Small", "MISTRAL_API_KEY", _mistral),
        ProviderSlot("mistral_ministral", "Mistral — Ministral 14B", "MISTRAL_API_KEY", _mistral_2),
        ProviderSlot("gemini_flash_lite", "Gemini 3.5 Flash-Lite", "GEMINI_API_KEY", _gemini_lite),
        ProviderSlot("groq_gpt_oss_20b", "Groq — GPT-OSS 20B", "GROQ_API_KEY", _groq_small),
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
# default priority when no config row overrides it; Cerebras goes LAST (it's
# trial-credit only, not a free tier — see _CEREBRAS_FALLBACK_MODELS).
PROVIDER_SLOTS: list[ProviderSlot] = [
    *_static_prefix_slots(),
    *_openrouter_slots(),
    *[
        ProviderSlot(key, display_name, "CEREBRAS_API_KEY", _make_cerebras(model))
        for key, display_name, model in _CEREBRAS_FALLBACK_MODELS
    ],
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
    declared = [*_static_prefix_slots(), *_openrouter_slots(), *_discover_cerebras_slots()]

    def is_enabled(slot: ProviderSlot) -> bool:
        override = config.get(slot.key)
        return override["enabled"] if override else True

    def priority(slot: ProviderSlot, index: int) -> int:
        override = config.get(slot.key)
        return override["priority"] if override else index

    usable = [s for s in declared if os.getenv(s.env_var) and is_enabled(s)]
    return sorted(usable, key=lambda s: priority(s, declared.index(s)))
