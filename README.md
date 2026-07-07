# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via a personalized email digest and a web dashboard. Multi-user with Supabase Auth — each user subscribes to the podcasts they care about and receives their own daily digest.

---

## Architecture

→ See **[docs/architecture.md](docs/architecture.md)** for the full Mermaid diagram.

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Triggers pipeline daily at midnight UTC (8 PM EDT) |
| **Source** | Python — RSS / yt-dlp | Fetches episode metadata and audio (8 parallel RSS workers; 4 concurrent LLM/transcript workers; Gemini → Groq retry chain) |
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
│       ├── backfill_platform_links.py  # One-time job: discover platform URLs for all existing sources
│       └── backfill_published_at.py    # One-time job: backfill episode published dates from RSS feeds
│
├── supabase/
│   └── migrations/
│       ├── 001_initial.sql          # Core tables: sources, episodes, transcripts, insights
│       ├── 002_multi_user.sql       # user_profiles, user_subscriptions, RLS policies
│       ├── 003_platform_links.sql   # platform_links JSONB column on sources
│       ├── 004_episode_queue.sql    # episode_queue table for async pipeline status signalling
│       ├── 005_engagement.sql       # insight_views, insight_reactions, insight_comments, comment_reactions
│       ├── 006_perf_indexes.sql     # Composite indexes on insights(date,source_id), (source_id,episode_id), (source_id,date)
│       ├── 007_fts.sql              # search_vector tsvector + GIN index + trigger + backfill for full-text search
│       └── 008_digest_domains.sql   # digest_domains text[] on user_profiles for per-user email domain filter
│
├── dashboard/                       # Next.js 15 web dashboard
│   ├── app/
│   │   ├── layout.tsx               # Root layout — async; fetches user server-side; passes to NavBar
│   │   ├── dashboard/page.tsx       # Daily Insights — personalized when signed in, public preview for guests
│   │   ├── dashboard/loading.tsx    # Instant skeleton shown by Next.js while the server fetches insight data
│   │   ├── podcasts/page.tsx        # Podcast catalog — public read-only for guests, full subscribe/unsubscribe for signed-in users; admin controls
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
│   │       ├── profile/             # GET/PUT user profile (display_name, digest_enabled, digest_hour, digest_domains)
│   │       ├── revalidate/          # POST — on-demand Next.js cache bust (called by pipeline after new insights saved)
│   │       ├── insights/[id]/engagement/ # GET ?view=1 — batched: record view + fetch views/likes/dislikes/commentCount in one round-trip
│   │       ├── insights/[id]/react/ # GET counts+mine · POST toggle like/dislike
│   │       ├── insights/[id]/comments/ # GET list · POST add comment
│   │       ├── insights/search/     # GET ?q= — full-text websearch across summary, key_points, quotes, tags
│   │       └── comments/[id]/       # DELETE own comment · /react POST like/dislike comment
│   ├── components/
│   │   ├── NavBar.tsx               # Sticky nav — Search button (Cmd/Ctrl+K overlay), user dropdown, TTS toggle, theme picker
│   │   ├── InsightCard.tsx          # Per-episode insight with read-aloud; shows episode published date
│   │   ├── DomainInsightView.tsx    # Domain tab filter (client)
│   │   ├── PodcastManager.tsx       # Catalog — domain tab layout (matches Dashboard order); optimistic subscribe toggles; subscribed cards show accent border + ring, unsubscribed cards are borderless; admin add/delete/toggle/reclassify
│   │   ├── ProfileForm.tsx          # Display name, digest toggle, UTC hour picker, per-domain digest filter chips
│   │   ├── SendDigestButton.tsx     # On-demand digest send — idle/sending/sent/error states
│   │   ├── EpisodeDigestPicker.tsx  # Pick podcast + episode → send or queue targeted digest
│   │   ├── SignOutButton.tsx        # POST /api/auth/logout → redirect
│   │   └── DateNav.tsx              # Calendar date picker — popover (desktop) / compact centred modal (mobile); available-date highlights; prefetches all dates
│   ├── contexts/
│   │   ├── ThemeContext.tsx          # 5 themes; CSS vars applied at runtime
│   │   └── TTSContext.tsx            # Global read-aloud enable/disable
│   ├── lib/
│   │   ├── auth.ts                  # React-cached getUser(), getUserId(), isAdmin(), getDisplayName()
│   │   ├── db.ts                    # Supabase / SQLite queries; unstable_cache for public views
│   │   ├── domain-colors.ts         # Canonical DOMAINS order + per-domain Tailwind colour tokens (shared by Dashboard and My Podcasts)
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
│   ├── backfill_platform_links.yml  # Manual workflow_dispatch — backfills platform URLs; optional source_id input
│   └── backfill_published_at.yml    # Manual workflow_dispatch — backfills episode published dates; optional source_id input
│
├── .env.example                     # Template — copy to .env and fill values
└── requirements.txt
```

---

## Multi-User Model

```
auth.users  (Supabase Auth)
    │
    ├── user_profiles       display_name, is_admin, digest_enabled, digest_hour, digest_domains[]
    │
    └── user_subscriptions  user_id → source_id (many-to-many)
                                │
                            sources (global catalog, admin-managed, is_public=TRUE)
                                │
                            insights (shared table — filtered per-user at query time)
                                │
                                ├── insight_views      view count (deduped per signed-in user; anon views stack)
                                ├── insight_reactions  like/dislike per user (unique per insight+user)
                                └── insight_comments   user comments
                                        │
                                        └── comment_reactions  like/dislike per comment per user
```

- **Guests**: see all public insights (unfiltered preview); views are tracked anonymously
- **Signed-in users**: see only insights from their subscribed sources; can like, dislike, and comment
- **Admins** (`is_admin=TRUE`): full catalog management (add/enable/disable/delete sources)
- **RLS**: `user_profiles`, `user_subscriptions`, `sources`, `insight_reactions`, `insight_comments`, `comment_reactions` all have row-level security; `insights` and `insight_views` are public-readable

---

## Digest Fan-Out

The pipeline runs once and sends N personalized emails:

1. Query `user_profiles JOIN auth.users` for all users with `digest_enabled=TRUE`
2. For each user: fetch their `user_subscriptions` → filter today's insights to those source IDs
3. Apply per-user domain filter: if `digest_domains` is set, drop insights outside those domains (`NULL` = all domains)
4. Send one HTML email per user via Gmail SMTP
5. Users with no subscriptions or no matching insights are skipped

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

> **Supabase is required in all environments** — auth and engagement features (views, likes, comments) always use Supabase directly. Point your local `.env.local` at the same Supabase project you use in production.

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
| `NEXT_APP_URL` | Vercel deployment URL — used to call `/api/revalidate` after pipeline runs |
| `REVALIDATE_SECRET` | Shared secret for cache revalidation endpoint (must also be set in Vercel env vars) |

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
| **Daily Insights** | Summaries, key points, quotes, and action items per episode; each card shows the episode's original release date (fetched from RSS `published_at`); instant loading skeleton while data fetches |
| **Personalized view** | Signed-in users see only insights from their subscribed podcasts |
| **Domain Tabs** | Filter by domain (Technology & AI, Business & Startups, etc.); auto-resets to first available tab on date change |
| **Calendar Date Picker** | Month calendar replaces the date dropdown — available dates marked with an accent dot, selected date shown as filled circle, today highlighted with an outline ring; all available dates prefetched for instant navigation; **mobile**: compact centred floating card (`min(320px, 100vw-32px)`), dimmed backdrop closes on tap, × button, 36px cells — no longer occupies full screen; **desktop**: right-aligned popover |
| **Read Aloud** | Per-card TTS via Web Speech API; global toggle in navbar |
| **Themes** | 5 built-in themes: **Parchment** (warm light), **Midnight** (deep blue slate), **Aurora** (ocean depths), **Cosmos** (violet nebula), **Forest** (deep emerald); compact swatch-grid picker (~196 px) — header shows "THEME / &lt;name&gt;" with the name updating live on hover; five 3-stripe colour chips (bg · mid · accent) in a single row; active chip glows in its accent colour |
| **My Podcasts** | Catalog visible to all visitors (public read-only); subscribe/unsubscribe requires sign-in; grouped by domain tabs (same canonical order as the Dashboard — Technology & AI, Business & Startups, etc.); subscribed cards show an accent-coloured border + soft ring shadow, unsubscribed cards are borderless; admin controls for catalog management (add, delete, enable/disable, reclassify domain); domain reclassification uses an optimistic inline select — card moves to the new domain tab immediately and reverts on API failure; podcast name search with iTunes-powered dropdown |
| **Search** | Full-text search across all insight summaries, key points, quotes, and action items; triggered via Search button in the navbar or `Cmd/Ctrl+K`; opens a fixed overlay with a debounced input (300ms), domain-colour-badged results, episode title and date, and click-to-navigate deep links that land on the exact insight card |
| **Profile** | Responsive 2-column layout (laptop) / single-column (mobile); display name, digest toggle, digest hour, **per-domain email filter** (chip toggles — faded chips are excluded from the daily digest; `null` means all domains); "Send Digest Now"; Episode Digest picker |
| **Episode Digest** | Pick a subscribed podcast + episode → instant email (✓) or fire-and-forget async processing (○, triggers GitHub Actions); clicking "Process & Send Digest" on an unprocessed episode queues the pipeline **and automatically sends the digest email when processing completes** — no second click needed; button shows "Processing — will send when ready…" during the wait; queued episodes show ⏳ in the dropdown; queued state persisted in localStorage (20-min TTL); when pipeline completes the ⏳ flips to ✓ live via Supabase Realtime (no page refresh); if pipeline fails, the `episode_queue` table receives a `failed` status row — Realtime pushes it to the browser instantly, resetting the episode to ○ with an error message (no polling) |
| **Engagement** | Per-card: view count (auto-tracked, deduped per signed-in user), like/dislike with optimistic UI and toggle-off, **copy-to-clipboard** button (writes both `text/html` and `text/plain` via `ClipboardItem` — pasting into Notion/Docs/email produces rich formatting with headings, bullets, and blockquotes; pasting into plain text gives clean ASCII; falls back to `writeText` on older browsers; icon swaps to ✓ for 2 s on success), share dropdown (Twitter/X, LinkedIn, Facebook, WhatsApp, Reddit, Telegram, Gmail, Copy link — share URL is a deep link encoding date + domain tab + card anchor so recipients land directly on the shared insight), collapsible comments panel with per-comment like/dislike and delete-own-comment; reactions and comments require sign-in; views tracked for all visitors |
| **Platform Links** | Each insight card shows a "Listen on" icon row — Spotify (green), Apple Podcasts (purple), YouTube (red), Website — linked to the correct platform; URLs auto-discovered by the pipeline: Apple via iTunes Search API (public, no key), Spotify + YouTube via Podcast 2.0 namespace tags in the RSS feed, Website from RSS `<channel><link>`; no API key required; when a new podcast is added to the catalog, a fire-and-forget `workflow_dispatch` to `backfill_platform_links.yml` runs automatically so icons appear without manual backfill |
| **Auth** | Supabase email + password; SSR JWT cookies; RLS enforced at DB level |
| **Mobile** | Responsive layout — single-column cards, compact NavBar on small screens |

---

## CI/CD & Deployment

- **Pipeline**: GitHub Actions runs `daily_pipeline.yml` at **midnight UTC (8 PM EDT)** daily.
  - `since_days` input: look-back window (default: 1)
  - `force_email` input: send digest from existing DB insights even if no new episodes (for testing)
  - `episode_audio_url` + `source_id` + `target_email` inputs: single-episode on-demand mode (triggered by `/api/digest/process`)
- **Backfill platform links**: `backfill_platform_links.yml` — manual `workflow_dispatch`; optional `source_id` input to run for a single source (leave blank to backfill all).
- **Backfill published dates**: `backfill_published_at.yml` — manual `workflow_dispatch`; optional `source_id` input to run per-source and stay within the 30-minute job timeout (leave blank to process all sources).
- **Dashboard**: Vercel auto-deploys on every push to `main`.
- **Branching**: `main` ← `develop` ← `feature/*`. PRs merged via GitHub; develop promoted to main after each feature.

---

## Running Tests

### Dashboard (TypeScript — Vitest + React Testing Library)

```bash
cd dashboard
npm test            # single run (CI)
npm run test:watch  # watch mode (development)
```

64 tests across 8 files covering all layers:

| Layer | Files | What's tested |
|---|---|---|
| **lib** | `domain-colors` | DOMAINS order, `getDomainColor` key mapping, fallback |
| **API routes** | `engagement`, `react`, `comments` | Auth gating, count tallying, reaction toggle, dedup guard, validation, CRUD |
| **Components** | `DomainInsightView`, `InsightCard` | Domain tab default, `?domain=` deep-link, tab switching, rendering, copy button, engagement state |
| **Contexts** | `ThemeContext`, `TTSContext` | CSS variable application, localStorage persist/restore, toggle behaviour |

Test infrastructure: `dashboard/vitest.config.ts` (Vitest 2, happy-dom, `@/` alias), `dashboard/vitest.setup.ts` (global mocks for `next/headers`, `next/navigation`, Clipboard API, `speechSynthesis`), and shared helpers in `dashboard/__tests__/helpers/`.

### Worker (Python — pytest)

```bash
pytest worker/tests/ -v
```
