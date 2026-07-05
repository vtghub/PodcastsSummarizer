# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via an email digest and a web dashboard.

---

## Architecture

→ See **[docs/architecture.md](docs/architecture.md)** for the full Mermaid diagram.

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Triggers pipeline daily at 07:00 UTC |
| **Source** | Python — RSS / yt-dlp | Fetches episode metadata and audio |
| **Transcription** | OpenAI Whisper (local) | Converts audio to text when no caption available |
| **LLM** | Gemini / Groq / Ollama | Extracts summary, key points, quotes, action items |
| **Storage** | Supabase (prod) / SQLite (dev) | Persists episodes, transcripts, and insights |
| **Email** | Gmail SMTP / Resend | Delivers optional daily digest |
| **Dashboard** | Next.js 15 on Vercel | Displays insights; manages podcast sources |
| **Auth** | Edge Middleware + HTTP-only cookie | Passcode-gates the My Podcasts page |

---

## Request Workflow

→ See **[docs/request-workflow.md](docs/request-workflow.md)** for full sequence diagrams covering:
- Pipeline (GitHub Actions → Supabase)
- Public dashboard request (`/dashboard`)
- Auth-gated request (`/podcasts`)
- Logout flow

---

## Project Structure

```
PodcastsSummarizer/
│
├── worker/                        # Python ingestion pipeline
│   ├── core/
│   │   ├── interfaces.py          # Abstract provider contracts
│   │   └── registry.py            # Resolves providers from env settings
│   ├── config/
│   │   └── settings.py            # All config — reads from .env
│   ├── providers/
│   │   ├── source/
│   │   │   ├── rss_source.py      # RSS feed fetching + audio download
│   │   │   ├── youtube_source.py  # YouTube transcript + audio
│   │   │   └── transcript_utils.py
│   │   ├── transcription/
│   │   │   └── local_whisper.py   # OpenAI Whisper (runs locally)
│   │   ├── llm/
│   │   │   ├── gemini_llm.py      # Google Gemini (default)
│   │   │   ├── groq_llm.py        # Groq free-tier fallback
│   │   │   └── ollama_llm.py      # Fully local via Ollama
│   │   ├── storage/
│   │   │   ├── sqlite_storage.py  # Local SQLite (dev)
│   │   │   └── supabase_storage.py# Cloud Postgres via Supabase
│   │   └── email/
│   │       └── gmail_smtp.py      # Gmail App Password SMTP
│   └── jobs/
│       ├── pipeline.py            # Main orchestration logic
│       └── scheduler.py           # APScheduler local cron
│
├── scripts/
│   ├── manage_podcasts.py         # CLI: add/list/disable sources, run pipeline
│   └── run_pipeline.py
│
├── dashboard/                     # Next.js 15 web dashboard
│   ├── app/
│   │   ├── layout.tsx             # Root layout — ThemeProvider + TTSProvider + NavBar
│   │   ├── page.tsx               # Home / landing page
│   │   ├── dashboard/page.tsx     # Daily Insights (public)
│   │   ├── podcasts/page.tsx      # Manage Sources (auth-gated)
│   │   ├── login/page.tsx         # Passcode login form
│   │   └── api/
│   │       ├── sources/           # CRUD for podcast sources
│   │       └── auth/              # login + logout route handlers
│   ├── components/
│   │   ├── NavBar.tsx             # Sticky nav — theme picker, TTS toggle, Sign Out
│   │   ├── InsightCard.tsx        # Per-episode insight with read-aloud
│   │   ├── DomainInsightView.tsx  # Domain tab filter (client)
│   │   ├── PodcastManager.tsx     # Add / pause / delete sources UI
│   │   ├── DateNav.tsx            # Date navigation
│   │   └── EmptyState.tsx
│   ├── contexts/
│   │   ├── ThemeContext.tsx        # 5 themes; CSS vars applied via JS at runtime
│   │   └── TTSContext.tsx          # Global read-aloud enable/disable
│   ├── hooks/
│   │   └── useSpeech.ts           # Per-card Web Speech API hook
│   ├── lib/
│   │   ├── auth.ts                # Session cookie helpers + SHA-256 validation
│   │   ├── db.ts                  # Supabase data queries
│   │   └── domain-colors.ts       # Domain → CSS variable class mapping
│   └── middleware.ts              # Edge middleware — protects /podcasts + /api/sources
│
├── .github/workflows/
│   └── daily_pipeline.yml         # Scheduled GitHub Actions pipeline (07:00 UTC)
│
├── .env.example                   # Template — copy to .env and fill values
└── requirements.txt
```

---

## Switching Providers

All providers are swapped via `.env` — no code changes needed:

| Setting | Local / Default | Cloud alternative |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `local_whisper` | `openai_whisper_api` |
| `LLM_PROVIDER` | `gemini` | `groq`, `ollama`, `openai`, `anthropic` |
| `STORAGE_PROVIDER` | `sqlite` | `supabase` |
| `EMAIL_PROVIDER` | `console` | `gmail_smtp`, `resend` |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes (default LLM) | Google AI Studio key |
| `GROQ_API_KEY` | No | Free-tier fallback LLM |
| `SUPABASE_DB_URL` | Cloud mode | Supabase connection string |
| `SUPABASE_SERVICE_KEY` | Cloud mode | Supabase service role key |
| `ADMIN_SECRET` | Dashboard auth | Passcode to access My Podcasts page |
| `GMAIL_SENDER` | Email digest | Gmail address for sending |
| `GMAIL_APP_PASSWORD` | Email digest | Gmail App Password |
| `DIGEST_RECIPIENT` | Email digest | Recipient email address |
| `WHISPER_MODEL` | No | `tiny` / `base` / `small` (default: `base`) |

See [`.env.example`](.env.example) for the full list with comments.

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env — minimum: set GEMINI_API_KEY

# 3. Add a podcast source
python scripts/manage_podcasts.py add \
  --name "Lex Fridman Podcast" \
  --url "https://lexfridman.com/feed/podcast/" \
  --domain "Technology & AI"

# 4. Run the pipeline (EMAIL_PROVIDER=console prints instead of sending)
python scripts/manage_podcasts.py run

# 5. Start the local scheduler (runs daily at DIGEST_HOUR)
python -m worker.jobs.scheduler

# 6. Start the dashboard
cd dashboard
npm install
npm run dev      # http://localhost:3000
```

---

## Dashboard Features

| Feature | Details |
|---|---|
| **Daily Insights** | Summaries, key points, quotes, and action items per episode |
| **Domain Tabs** | Filter by domain (Technology & AI, Business & Startups, etc.) |
| **Read Aloud** | Per-card TTS via Web Speech API; global toggle in navbar |
| **Themes** | 5 built-in themes (Anthropic Light, Midnight, Aurora, Dusk, Forest) |
| **My Podcasts** | Add, pause, and delete podcast sources — passcode-protected |
| **Auth Gate** | HTTP-only SHA-256 cookie; 30-day session; Edge middleware enforcement |

---

## CI/CD & Deployment

- **Pipeline**: GitHub Actions runs `daily_pipeline.yml` at 07:00 UTC. Can be triggered manually with a `since_days` parameter.
- **Dashboard**: Vercel auto-deploys on every push to `develop`. Production environment tracks `develop`.
- **Branching**: `main` ← `develop` ← `feature/*`. Feature branches are retained after merge.

---

## Running Tests

```bash
pytest worker/tests/ -v
```
