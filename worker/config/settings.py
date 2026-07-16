"""
All configuration lives here. Values are read from environment variables
with local-first defaults. Override via .env for cloud providers.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
# Load .env relative to the project root so Task Scheduler finds it regardless of CWD
load_dotenv(BASE_DIR / ".env")

# ---------------------------------------------------------------------------
# Provider selection — swap these strings to switch implementations
# ---------------------------------------------------------------------------
TRANSCRIPTION_PROVIDER = os.getenv("TRANSCRIPTION_PROVIDER", "local_whisper")
# options: "local_whisper" | "openai_whisper_api" | "groq_whisper"

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "gemini")
# options: "gemini" | "groq" | "ollama" | "openai" | "anthropic"

STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "sqlite")
# options: "sqlite" | "supabase" | "postgres"

EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "gmail_smtp")
# options: "gmail_smtp" | "resend" | "sendgrid" | "console" (prints to stdout, for dev)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
# Resolve DATA_DIR against BASE_DIR if it's a relative path (so Task Scheduler works)
_data_raw = os.getenv("DATA_DIR", "data")
DATA_DIR = Path(_data_raw) if Path(_data_raw).is_absolute() else BASE_DIR / _data_raw
AUDIO_CACHE_DIR = DATA_DIR / "audio_cache"
SQLITE_DB_PATH = DATA_DIR / os.getenv("SQLITE_DB_FILE", "podcasts.db")

DATA_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Whisper (local)
# ---------------------------------------------------------------------------
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
# options: "tiny", "base", "small", "medium", "large"

# ---------------------------------------------------------------------------
# Gemini
# ---------------------------------------------------------------------------
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

# ---------------------------------------------------------------------------
# Groq (free-tier fallback — 14,400 req/day, Llama 3.3 70B)
# ---------------------------------------------------------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
# llama-3.1-8b-instant: 131k TPM free tier (vs 12k for 70b) — fits 17 sources/run easily
GROQ_MODEL_70B = os.getenv("GROQ_MODEL_70B", "llama-3.3-70b-versatile")
# A second Groq model — separate quota bucket from GROQ_MODEL, so it's another
# waterfall slot from the same API key, not just a config alternative.

# ---------------------------------------------------------------------------
# Mistral (La Plateforme free tier)
# ---------------------------------------------------------------------------
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "mistral-small-latest")

# ---------------------------------------------------------------------------
# Cohere (trial key free tier)
# ---------------------------------------------------------------------------
COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")
COHERE_MODEL = os.getenv("COHERE_MODEL", "command-r")

# ---------------------------------------------------------------------------
# Cerebras (free tier — fast inference, generous per-minute request budget)
# ---------------------------------------------------------------------------
CEREBRAS_API_KEY = os.getenv("CEREBRAS_API_KEY", "")
CEREBRAS_MODEL = os.getenv("CEREBRAS_MODEL", "llama-3.3-70b")

# ---------------------------------------------------------------------------
# OpenRouter (free tier — hosts many ":free"-suffixed models under one key;
# each model gets its own PROVIDER_SLOT, same idea as Groq's two models)
# ---------------------------------------------------------------------------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

# ---------------------------------------------------------------------------
# Ollama (local LLM alternative)
# ---------------------------------------------------------------------------
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

# ---------------------------------------------------------------------------
# Supabase (cloud storage)
# ---------------------------------------------------------------------------
SUPABASE_DB_URL = os.getenv("SUPABASE_DB_URL", "")
# Format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

SUPABASE_URL = os.getenv("SUPABASE_URL", "")           # https://[ref].supabase.co
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")  # service_role secret key

# ---------------------------------------------------------------------------
# Email — Gmail SMTP
# ---------------------------------------------------------------------------
GMAIL_SENDER = os.getenv("GMAIL_SENDER", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
DIGEST_RECIPIENT = os.getenv("DIGEST_RECIPIENT", "")

# ---------------------------------------------------------------------------
# Digest schedule
# ---------------------------------------------------------------------------
DIGEST_HOUR = int(os.getenv("DIGEST_HOUR", "19"))   # 7 PM EST (00:00 UTC)
DIGEST_MINUTE = int(os.getenv("DIGEST_MINUTE", "0"))

# ---------------------------------------------------------------------------
# Domains — edit freely, podcasts are tagged to one of these
# ---------------------------------------------------------------------------
DOMAINS = [
    "Technology & AI",
    "Business & Startups",
    "Health & Science",
    "Finance & Investing",
    "Leadership & Productivity",
    "Society & Culture",
    "General",
    "Other",
]
