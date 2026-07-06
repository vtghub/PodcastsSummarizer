# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via a personalized email digest and a web dashboard. Multi-user with Supabase Auth — each user subscribes to the podcasts they care about and receives their own daily digest.

---

## Architecture

→ See **[docs/architecture.md](docs/architecture.md)** for the full Mermaid diagram.

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Triggers pipeline daily at midnight UTC (8 PM EDT) |
| **Source** | Python — RSS / yt-dlp | Fetches episode metadata and audio |
| **Transcription** | OpenAI Whisper (local, `tiny` model) | Converts audio to text when no caption available |
| **LLM** | Gemini (primary) → Groq (quota fallback) | Extracts summary, key points, quotes, action items |
| **Storage** | Supabase PostgreSQL (prod) / SQLite (dev) | Episodes, transcripts, insights, user profiles, subscriptions |
| **Email** | Gmail SMTP | Per-user personalized daily digest |
| **Dashboard** | Next.js 15 on Vercel | Insights viewer; podcast subscription management; profile |
| **Auth** | Supabase Auth (email + password, JWT, SSR cookies) | Full multi-user; RLS in Supabase |

---

## Request Workflow

→ See **[docs/request-workflow.md](docs/request-workflow.md)** for full sequence diagrams covering:
- Pipeline (GitHub Actions → Supabase → Gmail)
- Public dashboard request (`/dashboard`)
- Authenticated dashboard (personalized by subscriptions)
- My Podcasts — subscribe / unsubscribe flow
- Register / login / logout
- Profile update
- Admin source management

---

## Project Structure

```
PodcastsSummarizer/
│
├── worker/                          # Python ingestion pipeline
│   ├── core/
│   │   ├── interfaces.py            # Abstract provider contracts + UserDigestProfile dataclass
│   │   └── registry.py              # Resolves providers from env settings
│   ├── config/
│   │   └── settings.py              # All config — reads from .env
│   ├── providers/
│   │   ├── source/
│   │   │   ├── rss_source.py        # RSS feed fetching + audio download
│   │   │   └── youtube_source.py    # YouTube transcript + audio
│   │   ├── transcription/
│   │   │   └── local_whisper.py     # OpenAI Whisper (runs on Actions runner)
│   │   ├── llm/
│   │   │   ├── gemini_llm.py        # Google Gemini (default)
│   │   │   └── groq_llm.py          # Groq free-tier auto-fallback on quota error
│   │   ├── storage/
│   │   │   ├── sqlite_storage.py    # Local SQLite (dev, single-user)
│   │   │   └── supabase_storage.py  # Cloud Postgres — includes per-user digest helpers
│   │   └── email/
│   │       └── gmail_smtp.py        # Gmail App Password SMTP + HTML renderer
│   └── jobs/
│       ├── pipeline.py              # Orchestration: fetch → transcribe → LLM → store → email fan-out; run_single_episode() for on-demand
│       └── backfill_platform_links.py  # One-time job: discover platform URLs for all existing sources
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql          # Core tables: sources, episodes, transcripts, insights
│       ├── 002_multi_user.sql       # user_profiles, user_subscriptions, RLS policies
│       ├── 003_platform_links.sql   # platform_links JSONB column on sources
│       └── 004_episode_queue.sql    # episode_queue table for async pipeline status signalling
│
├── dashboard/                       # Next.js 15 web dashboard
│   ├── app/
│   │   ├── layout.tsx               # Root layout — async; fetches user server-side; passes to NavBar
│   │   ├── dashboard/page.tsx       # Daily Insights — personalized when signed in, public preview for guests
│   │   ├── podcasts/page.tsx        # Podcast catalog — subscribe/unsubscribe; admin controls
│   │   ├── profile/page.tsx         # User profile — display name, digest toggle, digest hour, episode digest picker
│   │   ├── login/page.tsx           # Email + password sign-in
│   │   ├── register/page.tsx        # New user registration
│   │   └── api/
│   │       ├── auth/login/          # signInWithPassword → Supabase sets SSR cookies
│   │       ├── auth/logout/         # signOut
│   │       ├── auth/register/       # signUp + INSERT user_profiles
│   │       ├── sources/             # CRUD for podcast catalog (admin only)
│   │       ├── subscriptions/       # GET/POST user subscriptions
│   │       ├── subscriptions/[id]/  # DELETE subscription
│   │       ├── digest/send/         # POST — send personalized or episode-specific digest (authed)
│   │       ├── digest/episodes/     # GET — RSS-aware episode list with processed flag
│   │       ├── digest/process/      # POST — trigger workflow_dispatch for unprocessed episode
│   │       ├── digest/status/       # GET — poll DB for insights on a specific episode
│   │       ├── podcasts/search/     # GET — proxy iTunes Search API for podcast name lookup
│   │       └── profile/             # GET/PUT user profile
│   ├── components/
│   │   ├── NavBar.tsx               # Sticky nav — user dropdown (Profile + Sign out) for authed users
│   │   ├── InsightCard.tsx          # Per-episode insight with read-aloud
│   │   ├── DomainInsightView.tsx    # Domain tab filter (client)
│   │   ├── PodcastManager.tsx       # Catalog — optimistic subscribe toggles; admin add/delete/toggle
│   │   ├── ProfileForm.tsx          # Display name, digest toggle, UTC hour picker
│   │   ├── SendDigestButton.tsx     # On-demand digest send — idle/sending/sent/error states
│   │   ├── EpisodeDigestPicker.tsx  # Pick podcast + episode → send or queue targeted digest
│   │   ├── SignOutButton.tsx        # POST /api/auth/logout → redirect
│   │   └── DateNav.tsx              # Date picker navigation
│   ├── contexts/
│   │   ├── ThemeContext.tsx          # 5 themes; CSS vars applied at runtime
│   │   └── TTSContext.tsx            # Global read-aloud enable/disable
│   ├── lib/
│   │   ├── auth.ts                  # React-cached getUser(), getUserId(), isAdmin(), getDisplayName()
│   │   ├── db.ts                    # Supabase / SQLite queries; unstable_cache for public views
│   │   ├── email.ts                 # nodemailer Gmail SMTP sender — HTML + plain text digest renderer
│   │   ├── supabase.ts              # Service-role Supabase client (server-only)
│   │   └── supabase-browser.ts      # Anon-key Supabase client singleton (browser — Realtime)
│   └── middleware.ts                # Supabase SSR session refresh; guards /api routes (401 if no user)
│
├── docs/
│   ├── architecture.md              # Mermaid system architecture diagram
│   └── request-workflow.md          # Mermaid request flow sequence diagrams
│
├── .github/workflows/
│   ├── daily_pipeline.yml           # Cron at midnight UTC; workflow_dispatch with since_days + force_email
│   └── backfill_platform_links.yml  # Manual workflow_dispatch — backfills platform URLs for existing sources
│
├── .env.example                     # Template — copy to .env and fill values
└── requirements.txt
```

---

## Multi-User Model

```
auth.users  (Supabase Auth)
    │
    ├── user_profiles       display_name, is_admin, digest_enabled, digest_hour
    │
    └── user_subscriptions  user_id → source_id (many-to-many)
                                │
                            sources (global catalog, admin-managed, is_public=TRUE)
                                │
                            insights (shared table — filtered per-user at query time)
```

- **Guests**: see all public insights (unfiltered preview)
- **Signed-in users**: see only insights from their subscribed sources
- **Admins** (`is_admin=TRUE`): full catalog management (add/enable/disable/delete sources)
- **RLS**: `user_profiles`, `user_subscriptions`, `sources` all have row-level security; `insights` are public-readable

---

## Digest Fan-Out

The pipeline runs once and sends N personalized emails:

1. Query `user_profiles JOIN auth.users` for all users with `digest_enabled=TRUE`
2. For each user: fetch their `user_subscriptions` → filter today's insights to those source IDs
3. Send one HTML email per user via Gmail SMTP
4. Users with no subscriptions or no matching insights are skipped

---

## Switching Providers

All providers are swapped via `.env` — no code changes needed:

| Setting | Local / Default | Cloud alternative |
|---|---|---|
| `TRANSCRIPTION_PROVIDER` | `local_whisper` | — |
| `LLM_PROVIDER` | `gemini` | `groq` (auto-fallback on quota) |
| `STORAGE_PROVIDER` | `sqlite` | `supabase` |
| `EMAIL_PROVIDER` | `console` | `gmail_smtp` |

---

## Environment Variables

### Worker (`.env`)

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Google AI Studio key (primary LLM) |
| `GROQ_API_KEY` | No | Groq key — auto-used when Gemini hits quota |
| `SUPABASE_DB_URL` | Cloud mode | Transaction Pooler URL (`aws-0-*.pooler.supabase.com:6543`) — **not** the direct IPv6 URL |
| `GMAIL_SENDER` | Email digest | Gmail address used as sender |
| `GMAIL_APP_PASSWORD` | Email digest | Gmail App Password (not your account password) |
| `STORAGE_PROVIDER` | No | `sqlite` (default) or `supabase` |
| `EMAIL_PROVIDER` | No | `console` (default) or `gmail_smtp` |
| `WHISPER_MODEL` | No | `tiny` / `base` / `small` (default: `base`) |

### Dashboard (`dashboard/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (public, safe to expose) |
| `SUPABASE_URL` | Yes | Same as above (server-side client) |
| `SUPABASE_SERVICE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `GMAIL_SENDER` | On-demand digest | Gmail address — used by `/api/digest/send` |
| `GMAIL_APP_PASSWORD` | On-demand digest | Gmail App Password — used by `/api/digest/send` |
| `GH_TOKEN` | Phase 2 episode processing | GitHub PAT with `workflow` scope — used by `/api/digest/process` to trigger `workflow_dispatch` |
| `GH_OWNER` | No | GitHub repo owner (default: `vtghub`) |
| `GH_REPO` | No | GitHub repo name (default: `PodcastsSummarizer`) |

### GitHub Actions Secrets

| Secret | Description |
|---|---|
| `SUPABASE_DB_URL` | Transaction Pooler connection string |
| `GEMINI_API_KEY` | Gemini API key |
| `GROQ_API_KEY` | Groq API key (optional fallback) |
| `GMAIL_SENDER` | Gmail sender address |
| `GMAIL_APP_PASSWORD` | Gmail App Password |

---

## Quick Start

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Configure worker
cp .env.example .env
# Edit .env — minimum: GEMINI_API_KEY

# 3. Run the pipeline locally (prints digest to console)
python -m worker.jobs.pipeline

# 4. Start the dashboard
cd dashboard
cp .env.local.example .env.local   # add Supabase keys
npm install
npm run dev      # http://localhost:3000
```

---

## Dashboard Features

| Feature | Details |
|---|---|
| **Daily Insights** | Summaries, key points, quotes, and action items per episode |
| **Personalized view** | Signed-in users see only insights from their subscribed podcasts |
| **Domain Tabs** | Filter by domain (Technology & AI, Business & Startups, etc.) |
| **Read Aloud** | Per-card TTS via Web Speech API; global toggle in navbar |
| **Themes** | 5 built-in themes (Light, Midnight, Aurora, Dusk, Forest) |
| **My Podcasts** | Catalog with subscribe/unsubscribe toggles; admin controls for catalog management; podcast name search with iTunes-powered dropdown |
| **Profile** | Responsive 2-column layout (laptop) / single-column (mobile); display name, digest toggle, digest hour; "Send Digest Now"; Episode Digest picker |
| **Episode Digest** | Pick a subscribed podcast + episode → instant email (✓) or fire-and-forget async processing (○, triggers GitHub Actions); queued episodes show ⏳ in dropdown with a disabled "Processing Queued" button to prevent duplicate requests; queued state persisted in localStorage (20-min TTL); when pipeline completes the ⏳ flips to ✓ live via Supabase Realtime (no page refresh); if pipeline fails, the `episode_queue` table receives a `failed` status row — Realtime pushes it to the browser instantly, resetting the episode to ○ with an error message (no polling) |
| **Platform Links** | Each insight card shows a "Listen on" icon row — Spotify (green), Apple Podcasts (purple), YouTube (red), Website — linked to the correct platform; URLs auto-discovered by the pipeline: Apple via iTunes Search API (public, no key), Spotify + YouTube via Podcast 2.0 namespace tags in the RSS feed, Website from RSS `<channel><link>`; no API key required |
| **Auth** | Supabase email + password; SSR JWT cookies; RLS enforced at DB level |
| **Mobile** | Responsive layout — single-column cards, compact NavBar on small screens |

---

## CI/CD & Deployment

- **Pipeline**: GitHub Actions runs `daily_pipeline.yml` at **midnight UTC (8 PM EDT)** daily.
  - `since_days` input: look-back window (default: 1)
  - `force_email` input: send digest from existing DB insights even if no new episodes (for testing)
  - `episode_audio_url` + `source_id` + `target_email` inputs: single-episode on-demand mode (triggered by `/api/digest/process`)
- **Dashboard**: Vercel auto-deploys on every push to `main`.
- **Branching**: `main` ← `develop` ← `feature/*`. PRs merged via GitHub; develop promoted to main after each feature.

---

## Running Tests

```bash
pytest worker/tests/ -v
```
