# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via an email digest and a web dashboard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GitHub Actions (CI/CD)                          │
│   Schedule: 07:00 UTC daily  │  workflow_dispatch (manual trigger)      │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Python Worker Pipeline                           │
│                                                                          │
│   Sources (RSS / YouTube)                                                │
│        │                                                                 │
│        ▼                                                                 │
│   Fetch Episodes  ──► Text transcript?  ──yes──► transcript_text        │
│        │                    │no                                          │
│        │                    ▼                                            │
│        │           Download Audio  ──► Whisper (local STT)              │
│        │                    │                                            │
│        └────────────────────┘                                            │
│                             │                                            │
│                             ▼                                            │
│                    LLM Insight Extraction                                │
│                  (Gemini / Groq / Ollama)                                │
│                             │                                            │
│                             ▼                                            │
│                    Save to Storage                                       │
│                  (SQLite  /  Supabase)                                   │
│                             │                                            │
│                             ▼                                            │
│                    Email Digest  (optional)                              │
│                 (Gmail SMTP / Resend / console)                          │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                    (Supabase stores insights)
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Next.js Dashboard  (Vercel)                          │
│                                                                          │
│   Public pages                                                           │
│   ├── /              →  Home / landing                                   │
│   └── /dashboard    →  Daily Insights (grouped by domain)               │
│                                                                          │
│   Protected pages  (passcode auth, HTTP-only cookie)                    │
│   └── /podcasts     →  Manage podcast sources (add / pause / delete)    │
│                                                                          │
│   API routes                                                             │
│   ├── GET  /api/sources          →  list sources        [auth required]  │
│   ├── POST /api/sources          →  add source          [auth required]  │
│   ├── PUT  /api/sources/[id]     →  update source       [auth required]  │
│   ├── DELETE /api/sources/[id]   →  delete source       [auth required]  │
│   ├── POST /api/auth/login       →  verify passcode, set cookie          │
│   └── POST /api/auth/logout      →  clear session cookie                 │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Request Workflow

### Pipeline (GitHub Actions → Supabase)

```
GitHub Actions (07:00 UTC)
        │
        ▼
run_pipeline(since=yesterday)
        │
        ├─► storage.get_sources(enabled_only=True)
        │
        └─► for each source:
                │
                ├─► fetch_latest_episodes(since)
                │
                └─► for each episode:
                        │
                        ├─► storage.episode_exists?  ──yes──► skip
                        │
                        ├─► storage.save_episode()
                        │
                        ├─► source_provider.fetch_transcript_text()
                        │       │ (RSS caption / YouTube transcript)
                        │       └── None? ──► download_audio()
                        │                        └──► Whisper.transcribe()
                        │
                        ├─► storage.save_transcript()
                        │
                        ├─► llm.extract_insights(episode, transcript, domain)
                        │       └── Returns: summary, key_points, key_quotes,
                        │                   action_items, tags
                        │
                        └─► storage.save_insight()
                              storage.mark_episode_done()
```

### Dashboard — Unauthenticated Page Request (`/dashboard`)

```
Browser  ──GET /dashboard──►  Next.js (Vercel Edge)
                                    │
                                    ▼ (middleware: no match, pass through)
                               Server Component
                                    │
                                    ▼
                          db.getInsightsByDate(today)
                          (Supabase / SQLite read)
                                    │
                                    ▼
                          DomainInsightView (client)
                          ├── Domain tab selector
                          └── InsightCard grid
                                    │
                                    ▼
                              Browser renders
                         (theme from localStorage,
                          TTS via Web Speech API)
```

### Dashboard — Protected Page Request (`/podcasts`)

```
Browser  ──GET /podcasts──►  Next.js Middleware (Edge)
                                    │
                             cookie present?
                            /              \
                          no               yes
                          │                │
                          ▼                ▼ isValidSession(SHA-256 check)
                   redirect to          pass ──► /podcasts server page
                   /login?from=/podcasts        └──► PodcastManager (client)
                                                        ├── GET /api/sources
                                                        ├── POST /api/sources
                                                        ├── PUT /api/sources/[id]
                                                        └── DELETE /api/sources/[id]
```

### Auth Flow (Login / Logout)

```
Login:
  Browser ──POST /api/auth/login { passcode }──► Route Handler
                                                       │
                                               passcode === ADMIN_SECRET?
                                              /                         \
                                            no                          yes
                                            │                            │
                                     401 { error }          Set-Cookie: admin_session
                                                             = SHA256(ADMIN_SECRET)
                                                             httpOnly, SameSite=strict
                                                             maxAge=30 days
                                                                         │
                                                              redirect → /podcasts

Logout:
  Browser ──POST /api/auth/logout──► Route Handler
                                           │
                                   Set-Cookie: admin_session=""
                                   maxAge=0  (clears cookie)
                                           │
                                   redirect → /
```

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
