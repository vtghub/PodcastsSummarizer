# Podcast Insights System

Extracts daily insights from podcasts and delivers them as an email digest + web dashboard.

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env — minimum: set GEMINI_API_KEY

# 3. Add a podcast
python scripts/manage_podcasts.py add \
  --name "Lex Fridman Podcast" \
  --url "https://lexfridman.com/feed/podcast/" \
  --domain "Technology & AI"

# 4. Run the pipeline (EMAIL_PROVIDER=console prints instead of sending)
python scripts/manage_podcasts.py run

# 5. Start the scheduler (runs daily at DIGEST_HOUR)
python -m worker.jobs.scheduler
```

## Project Structure

```
worker/
  core/
    interfaces.py     # Abstract provider contracts (the extensibility hooks)
    registry.py       # Resolves providers from settings
  config/
    settings.py       # All config — reads from .env
  providers/
    source/           # RSS, YouTube
    transcription/    # local_whisper (+ cloud stubs)
    llm/              # Gemini, Ollama
    storage/          # SQLite (+ Supabase stub)
    email/            # Gmail SMTP, console
  jobs/
    pipeline.py       # Orchestration logic
    scheduler.py      # Local APScheduler cron
  tests/
scripts/
  manage_podcasts.py  # CLI: add/list/disable sources, run pipeline
dashboard/            # Next.js web dashboard (coming next)
data/                 # SQLite DB + audio cache (gitignored)
```

## Switching Providers

All providers are swapped via `.env` — no code changes:

| Setting | Local (default) | Cloud |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `local_whisper` | `openai_whisper_api` |
| `LLM_PROVIDER` | `gemini` or `ollama` | `openai`, `anthropic` |
| `STORAGE_PROVIDER` | `sqlite` | `supabase` |
| `EMAIL_PROVIDER` | `console` → `gmail_smtp` | `resend` |

## Running Tests

```bash
pytest worker/tests/ -v
```
