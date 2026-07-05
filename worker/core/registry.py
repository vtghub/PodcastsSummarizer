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


def get_transcription_provider() -> TranscriptionProvider:
    match TRANSCRIPTION_PROVIDER:
        case "local_whisper":
            from worker.providers.transcription.local_whisper import LocalWhisperProvider
            return LocalWhisperProvider()
        case _:
            raise ValueError(f"Unknown TRANSCRIPTION_PROVIDER: {TRANSCRIPTION_PROVIDER!r}")


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
        case _:
            raise ValueError(f"Unknown LLM_PROVIDER: {LLM_PROVIDER!r}")


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
