# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via an email digest and a web dashboard.

---

## Architecture

→ See **[docs/architecture.md](docs/architecture.md)** for the full Mermaid diagram.

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Triggers pipeline daily at 7 PM EST (midnight UTC) |
| **Source** | Python — RSS / yt-dlp | Fetches episode metadata and audio |
| **Transcription** | OpenAI Whisper (local) | Converts audio to text when no caption available |
| **LLM** | Gemini / Groq / Ollama | Extracts summary, key points, quotes, action items |
| **Storage** | Supabase (prod) / SQLite (dev) | Persists episodes, transcripts, and insights |
| **Email** | Gmail SMTP / Resend | Delivers optional daily digest |
| **Dashboard** | Next.js 15 on Vercel | Displays insights; manages podcast sources |
| **Auth** | Edge Middleware + HTTP-only cookie | Guards `/api/sources`; `/podcasts` is public (read-only for guests) |

---

## Request Workflow

→ See **[docs/request-workflow.md](docs/request-workflow.md)** for full sequence diagrams covering:
- Pipeline (GitHub Actions → Supabase)
- Public dashboard request (`/dashboard`)
- My Podcasts page (public, auth-aware UI)
- Login / logout flows
- API source mutation auth guard

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
│   │   ├── layout.tsx             # Root layout — ThemeProvider + TTSProvider + NavBar (auth-aware)
│   │   ├── page.tsx               # Home / landing page
│   │   ├── dashboard/page.tsx     # Daily Insights (public)
│   │   ├── podcasts/page.tsx      # Podcast sources — public; read-only for guests, full UI when authed
│   │   ├── login/page.tsx         # Passcode login form
│   │   └── api/
│   │       ├── sources/           # CRUD for podcast sources (auth required)
│   │       └── auth/              # login + logout route handlers
│   ├── components/
│   │   ├── NavBar.tsx             # Sticky nav — theme picker, TTS toggle, Sign Out (when authed)
│   │   ├── InsightCard.tsx        # Per-episode insight with read-aloud
│   │   ├── DomainInsightView.tsx  # Domain tab filter (client)
│   │   ├── PodcastManager.tsx     # Source list — hides management actions for guests
│   │   ├── DateNav.tsx            # Date navigation
│   │   └── EmptyState.tsx
│   ├── contexts/
│   │   ├── ThemeContext.tsx        # 5 themes; CSS vars applied via JS at runtime
│   │   └── TTSContext.tsx          # Global read-aloud enable/disable
│   ├── hooks/
│   │   └── useSpeech.ts           # Per-card Web Speech API hook
│   ├── lib/
│   │   ├── auth.ts                # Session cookie helpers + SHA-256 validation
│   │   ├── db.ts                  # Supabase / SQLite data queries
│   │   └── domain-colors.ts       # Domain → CSS variable class mapping
│   └── middleware.ts              # Edge middleware — protects /api/sources only
│
├── docs/
│   ├── architecture.md            # Mermaid system architecture diagram
│   └── request-workflow.md        # Mermaid request flow sequence diagrams
│
├── .github/workflows/
│   └── daily_pipeline.yml         # Scheduled pipeline — 7 PM EST (midnight UTC) daily
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
| `SUPABASE_URL` | Cloud mode | Supabase project URL |
| `SUPABASE_DB_URL` | Cloud mode | Supabase connection string (pipeline) |
| `SUPABASE_SERVICE_KEY` | Cloud mode | Supabase service role key |
| `ADMIN_SECRET` | Dashboard auth | Passcode to access full management UI |
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
| **Themes** | 5 built-in themes (Light, Midnight, Aurora, Dusk, Forest) |
| **My Podcasts** | Public page — read-only for guests; full add/enable/delete when signed in |
| **Auth** | Passcode login; HTTP-only SHA-256 cookie; 30-day session; only `/api/sources` is gated |

---

## CI/CD & Deployment

- **Pipeline**: GitHub Actions runs `daily_pipeline.yml` at **7 PM EST (midnight UTC)** daily. Can be triggered manually with a `since_days` parameter.
- **Dashboard**: Vercel auto-deploys on every push to `develop`. Production environment tracks `develop`.
- **Branching**: `main` ← `develop` ← `feature/*`. Feature branches are retained after merge.

---

## Running Tests

```bash
pytest worker/tests/ -v
```
