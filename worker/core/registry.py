"""
Provider registry — resolves the correct implementation based on settings.
Add a new provider here and in settings.py — nothing else changes.
"""

from worker.config.settings import (
    TRANSCRIPTION_PROVIDER, LLM_PROVIDER, STORAGE_PROVIDER, EMAIL_PROVIDER,
)
from worker.core.interfaces import (
    TranscriptionProvider, LLMProvider, StorageProvider, EmailProvider,
)


_transcription_provider: TranscriptionProvider | None = None


def get_transcription_provider() -> TranscriptionProvider:
    global _transcription_provider
    if _transcription_provider is None:
        match TRANSCRIPTION_PROVIDER:
            case "local_whisper":
                from worker.providers.transcription.local_whisper import LocalWhisperProvider
                _transcription_provider = LocalWhisperProvider()
            case _:
                raise ValueError(f"Unknown TRANSCRIPTION_PROVIDER: {TRANSCRIPTION_PROVIDER!r}")
    return _transcription_provider


def get_llm_provider() -> LLMProvider:
    match LLM_PROVIDER:
        case "gemini":
            from worker.providers.llm.gemini_llm import GeminiLLMProvider
            return GeminiLLMProvider()
        case "groq":
            from worker.providers.llm.groq_llm import GroqLLMProvider
            return GroqLLMProvider()
        case "ollama":
            from worker.providers.llm.ollama_llm import OllamaLLMProvider
            return OllamaLLMProvider()
        case "mistral":
            from worker.providers.llm.mistral_llm import MistralLLMProvider
            return MistralLLMProvider()
        case "cohere":
            from worker.providers.llm.cohere_llm import CohereLLMProvider
            return CohereLLMProvider()
        case "waterfall":
            from worker.providers.llm.waterfall_llm import WaterfallLLMProvider
            return WaterfallLLMProvider()
        case _:
            raise ValueError(f"Unknown LLM_PROVIDER: {LLM_PROVIDER!r}")


def get_ranking_llm_provider() -> LLMProvider:
    """
    Always a waterfall scoped to 'recommendations', independent of LLM_PROVIDER
    — weekly best-of-week ranking is admin-configurable on its own, separately
    from pipeline extraction. Raises ValueError if no provider is both enabled
    and has its API key set for this scope; callers should catch this and fall
    back to default_rank_insights().
    """
    from worker.providers.llm.waterfall_llm import WaterfallLLMProvider
    return WaterfallLLMProvider(scope="recommendations")


def get_storage_provider() -> StorageProvider:
    match STORAGE_PROVIDER:
        case "sqlite":
            from worker.providers.storage.sqlite_storage import SQLiteStorage
            return SQLiteStorage()
        case "supabase":
            from worker.providers.storage.supabase_storage import SupabaseStorageProvider
            return SupabaseStorageProvider()
        case _:
            raise ValueError(f"Unknown STORAGE_PROVIDER: {STORAGE_PROVIDER!r}")


def get_email_provider() -> EmailProvider:
    match EMAIL_PROVIDER:
        case "gmail_smtp":
            from worker.providers.email.gmail_smtp import GmailSMTPProvider
            return GmailSMTPProvider()
        case "console":
            from worker.providers.email.gmail_smtp import ConsoleEmailProvider
            return ConsoleEmailProvider()
        case _:
            raise ValueError(f"Unknown EMAIL_PROVIDER: {EMAIL_PROVIDER!r}")
