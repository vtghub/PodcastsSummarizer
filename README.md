# Podcast Insights System

Automatically extracts daily insights from podcasts and surfaces them via a personalized email digest and a web dashboard. Multi-user with Supabase Auth — each user subscribes to the podcasts they care about and receives their own daily digest.

---

## Architecture

→ See **[docs/architecture.md](docs/architecture.md)** for the full Mermaid diagram.

| Layer | Technology | Role |
|---|---|---|
| **Scheduler** | GitHub Actions (cron) | Ingestion pipeline every 4 hours; hourly digest fan-out; weekly recommendations Sundays 10 AM UTC |
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
│   │   │   └── local_whisper.py     # OpenAI Whisper (runs on Actions runner); domain-aware initial_prompt per source domain; post-processing corrections for known proper-noun mishearings (e.g. "Cloud AI" → "Claude AI", "Claude co-work" → "Claude Cowork")
│   │   ├── llm/
│   │   │   ├── gemini_llm.py        # Google Gemini (default)
│   │   │   └── groq_llm.py          # Groq free-tier auto-fallback on quota error
│   │   ├── storage/
│   │   │   ├── sqlite_storage.py    # Local SQLite (dev, single-user)
│   │   │   └── supabase_storage.py  # Cloud Postgres — includes per-user digest helpers
│   │   └── email/
│   │       └── gmail_smtp.py        # Gmail App Password SMTP + HTML renderer
│   └── jobs/
│       ├── pipeline.py              # Orchestration: fetch → transcribe → LLM → store → async email fan-out; episode retry; RSS backoff; run_single_episode() for on-demand
│       ├── recommendations.py       # Weekly recommendations job: LLM-ranked best insights + trending podcast discovery per user
│       ├── backfill_platform_links.py  # One-time job: discover platform URLs for all existing sources
│       └── backfill_published_at.py    # One-time job: backfill episode published dates from RSS feeds
│   └── tests/
│       └── test_pipeline.py         # Pytest suite (24 tests) — SQLite storage, fan-out logic, email providers, pipeline resilience
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
│       ├── 008_digest_domains.sql   # digest_domains text[] on user_profiles for per-user email domain filter
│       ├── 009_pipeline_resilience.sql  # retry_count + retry_after on episode_queue; backoff_until + fetch_error_count + platform_links_attempted_at on sources
│       ├── 010_bookmarks.sql        # insight_bookmarks table with RLS (per-user SELECT/INSERT/DELETE)
│       ├── 011_last_visited.sql     # last_visited_at TIMESTAMPTZ on user_profiles (new-insight badge)
│       ├── 012_digest_frequency.sql # digest_frequency ('daily'|'weekly') + digest_day_of_week (0=Mon…6=Sun) on user_profiles
│       ├── 013_backfill_insight_dates.sql # One-time backfill: sets insight.date = episode.published_at for all existing rows
│       └── 014_insight_views_delete.sql # Adds DELETE RLS policy on insight_views so users can remove their own view rows (Mark as Unread)
│
├── dashboard/                       # Next.js 15 web dashboard
│   ├── app/
│   │   ├── layout.tsx               # Root layout — async; fetches user server-side; passes to NavBar
│   │   ├── dashboard/page.tsx       # Daily Insights — personalized when signed in; WelcomeOnboarding for new users; public preview for guests; CSV export button for signed-in users
│   │   ├── dashboard/loading.tsx    # Instant skeleton shown by Next.js while the server fetches insight data
│   │   ├── analytics/page.tsx       # Analytics dashboard — KPI cards, insights-per-day chart, domain breakdown, top insights (signed-in only)
│   │   ├── saved/page.tsx           # Saved Insights — lists all bookmarked insights for signed-in user, sorted by bookmark date
│   │   ├── podcasts/page.tsx        # Podcast catalog — public read-only for guests, full subscribe/unsubscribe for signed-in users; admin controls
│   │   ├── profile/page.tsx         # User profile — display name, digest toggle, digest hour, digest frequency (daily/weekly), episode digest picker
│   │   ├── onboarding/page.tsx      # New-user onboarding wizard (auth-required; redirects to /dashboard if already subscribed)
│   │   ├── about/page.tsx           # Public About page — feature overview, CTA buttons (no auth required)
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
│   │       ├── digest/preview/      # GET — returns exact digest HTML in browser (no email sent)
│   │       ├── digest/episodes/     # GET — RSS-aware episode list with processed flag
│   │       ├── digest/process/      # POST — trigger workflow_dispatch for unprocessed episode
│   │       ├── digest/status/       # GET — poll DB for insights on a specific episode
│   │       ├── podcasts/search/     # GET — proxy iTunes Search API for podcast name lookup
│   │       ├── recommendations/podcasts/ # GET ?domains=X,Y — catalog sources + iTunes suggestions for onboarding
│   │       ├── profile/             # GET/PUT user profile (display_name, digest_enabled, digest_hour, digest_domains, digest_frequency, digest_day_of_week)
│   │       ├── revalidate/          # POST — on-demand Next.js cache bust (called by pipeline after new insights saved)
│   │       ├── insights/[id]/engagement/ # GET ?view=1 — batched: record view + fetch views/likes/dislikes/commentCount/bookmarked/is_read in one round-trip
│   │       ├── insights/[id]/engagement/unread/ # DELETE — removes caller's insight_views row (mark as unread); requires auth
│   │       ├── insights/[id]/bookmark/ # GET is-bookmarked · POST toggle bookmark on/off (authed)
│   │       ├── insights/[id]/react/ # GET counts+mine · POST toggle like/dislike
│   │       ├── insights/[id]/comments/ # GET list · POST add comment
│   │       ├── insights/export/     # GET ?format=csv|pdf&date=YYYY-MM-DD — download insights for a date (authed)
│   │       ├── insights/search/     # GET ?q= — full-text websearch across summary, key_points, quotes, tags; optional ?domain= ?from= ?to= filters
│   │       └── comments/[id]/       # DELETE own comment · /react POST like/dislike comment
│   ├── components/
│   │   ├── NavBar.tsx               # Sticky nav — Search button (Cmd/Ctrl+K overlay), Analytics + Saved + My Podcasts links (signed-in, desktop only), About link (always visible), "N new" pill when unread insights exist, user dropdown, TTS toggle, theme picker
│   │   ├── AnalyticsDashboard.tsx   # Client component — KPI cards, SVG bar chart (insights/day), domain breakdown bars, top-10 most-viewed list
│   │   ├── ExportDropdown.tsx       # Client component — "↓ Export ▾" button with CSV / JSON / PDF options
│   │   ├── InsightCard.tsx          # Per-episode insight with read-aloud, bookmark toggle (☆/★), engagement bar
│   │   ├── SavedInsightsList.tsx    # Client wrapper for /saved — renders bookmarked InsightCards with empty state
│   │   ├── DomainInsightView.tsx    # Domain tab filter (client) + Supabase Realtime subscription (auto-refresh on new insights)
│   │   ├── PodcastManager.tsx       # Catalog — domain tab layout; optimistic subscribe toggles; admin reclassify with toast on failure
│   │   ├── ProfileForm.tsx          # Display name, digest toggle, Daily/Weekly frequency toggle, day-of-week picker, UTC hour picker, per-domain digest filter chips
│   │   ├── OnboardingWizard.tsx     # 3-step onboarding: domain picker → catalog + iTunes recommendations → subscribe & finish
│   │   ├── WelcomeOnboarding.tsx    # Fallback first-run card shown on dashboard if user skips onboarding — 3-step guide + CTA to /onboarding
│   │   ├── LocalDateGuard.tsx       # Client component — corrects dashboard date when browser timezone differs from server UTC (runs once on mount; no-op if dates match)
│   │   ├── SendDigestButton.tsx     # On-demand digest send + Preview button (opens /api/digest/preview in new tab)
│   │   ├── EpisodeDigestPicker.tsx  # Pick podcast + episode → send or queue targeted digest
│   │   ├── SignOutButton.tsx        # POST /api/auth/logout → redirect
│   │   └── DateNav.tsx              # Calendar date picker — popover (desktop) / compact centred modal (mobile); available-date highlights; prefetches all dates
│   ├── contexts/
│   │   ├── ThemeContext.tsx          # 5 themes; CSS vars applied at runtime
│   │   └── TTSContext.tsx            # Global read-aloud enable/disable
│   ├── lib/
│   │   ├── auth.ts                  # React-cached getUser(), getUserId(), isAdmin(), getDisplayName()
│   │   ├── analytics.ts             # getAnalytics(userId) — aggregates totals, insights-per-day, domain stats, top insights from subscribed sources
│   │   ├── db.ts                    # Supabase / SQLite queries; unstable_cache for public views
│   │   ├── domain-colors.ts         # Canonical DOMAINS order + per-domain Tailwind colour tokens (shared by Dashboard and My Podcasts)
│   │   ├── email.ts                 # nodemailer Gmail SMTP sender — HTML + plain text digest renderer
│   │   ├── supabase.ts              # Service-role Supabase client (server-only)
│   │   └── supabase-browser.ts      # Anon-key Supabase client singleton (browser — Realtime)
│   └── middleware.ts                # Supabase SSR session refresh; guards /api routes (401 if no user); token-bucket rate limiting (20 req/min) on comment/reaction mutations
│
├── docs/
│   ├── architecture.md              # Mermaid system architecture diagram
│   └── request-workflow.md          # Mermaid request flow sequence diagrams
│
├── .github/workflows/
│   ├── daily_pipeline.yml           # Cron every 4 hours (ingestion only, no email); workflow_dispatch with since_days + force_email
│   ├── hourly_digest.yml            # Cron every hour — per-user digest fan-out (checks digest_hour in user's timezone)
│   ├── weekly_recommendations.yml   # Cron Sundays 10 AM UTC — LLM-ranked best-of-week + trending podcast discovery email
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
    ├── user_profiles       display_name, is_admin, digest_enabled, digest_hour, digest_domains[], digest_frequency, digest_day_of_week, last_visited_at
    │
    └── user_subscriptions  user_id → source_id (many-to-many)
                                │
                            sources (global catalog, admin-managed, is_public=TRUE)
                                │
                            insights (shared table — filtered per-user at query time)
                                │
                                ├── insight_views      view count (deduped per signed-in user; anon views stack)
                                ├── insight_reactions  like/dislike per user (unique per insight+user)
                                ├── insight_bookmarks  saved/starred insights per user (unique per insight+user)
                                └── insight_comments   user comments
                                        │
                                        └── comment_reactions  like/dislike per comment per user
```

- **Guests**: see all public insights (unfiltered preview); views are tracked anonymously
- **Signed-in users**: see only insights from their subscribed sources; can like, dislike, and comment
- **Admins** (`is_admin=TRUE`): full catalog management (add/enable/disable/delete sources)
- **RLS**: `user_profiles`, `user_subscriptions`, `sources`, `insight_reactions`, `insight_bookmarks`, `insight_comments`, `comment_reactions` all have row-level security; `insights` and `insight_views` are public-readable; `insight_views` additionally allows authenticated users to delete their own rows (Mark as Unread)

---

## Digest Fan-Out

The hourly digest job (`hourly_digest.yml`) sends N personalized emails in parallel, one per user whose local hour matches their configured `digest_hour`:

1. Query `user_profiles JOIN auth.users` for all users with `digest_enabled=TRUE`
2. For each user (up to 8 concurrent SMTP workers):
   - Compute the user's **local date** using `datetime.now(ZoneInfo(digest_timezone))` — avoids UTC date mismatch for users in negative-offset timezones late at night
   - Check `local_now.hour == digest_hour`; skip if not their send hour (unless `force=True`)
3. Fetch their `user_subscriptions` → look up insights for **user's local date** and those source IDs
4. Apply per-user domain filter: if `digest_domains` is set, drop insights outside those domains (`NULL` = all domains)
5. Apply frequency filter: users with `digest_frequency = 'weekly'` are skipped unless `local_now.weekday() == digest_day_of_week` (0=Monday…6=Sunday)
6. Send one HTML email per user via Gmail SMTP — failures are isolated per-user and logged without blocking other recipients
7. Users with no subscriptions or no matching insights are skipped

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
| **Domain Tabs** | Filter by domain (Technology & AI, Business & Startups, etc.); auto-resets to first available tab on date change; **mobile**: single horizontally-scrollable chip row (no wrapping, swipe to reveal all domains); **desktop**: wraps naturally across multiple rows |
| **Calendar Date Picker** | Month calendar replaces the date dropdown — available dates marked with an accent dot, selected date shown as filled circle, today highlighted with an outline ring; all available dates prefetched for instant navigation; **mobile**: compact centred floating card (`min(320px, 100vw-32px)`), dimmed backdrop closes on tap, × button, 36px cells — no longer occupies full screen; **desktop**: right-aligned popover |
| **Read Aloud** | Per-card TTS via Web Speech API; global toggle in navbar |
| **Themes** | 5 built-in themes: **Parchment** (warm light), **Midnight** (deep blue slate), **Aurora** (ocean depths), **Cosmos** (violet nebula), **Forest** (deep emerald); compact swatch-grid picker (~196 px) — header shows "THEME / &lt;name&gt;" with the name updating live on hover; five 3-stripe colour chips (bg · mid · accent) in a single row; active chip glows in its accent colour |
| **My Podcasts** | Catalog visible to all visitors (public read-only); subscribe/unsubscribe requires sign-in; grouped by domain tabs (same canonical order as the Dashboard — Technology & AI, Business & Startups, etc.); domain strip is a horizontally-scrollable single row on mobile (swipe to reveal all domains); subscribed cards show an accent-coloured border + soft ring shadow, unsubscribed cards are borderless; admin controls for catalog management (add, delete, enable/disable, reclassify domain); domain reclassification uses an optimistic inline select — card moves to the new domain tab immediately and **reverts with a toast notification on API failure**; podcast name search with iTunes-powered dropdown |
| **Search** | Full-text search across all insight summaries, key points, quotes, and action items; triggered via Search button in the navbar or `Cmd/Ctrl+K`; opens a fixed overlay with a debounced input (300ms), domain-colour-badged results, episode title and date, and click-to-navigate deep links that land on the exact insight card; **filter bar** below the input: domain chips (abbreviated labels, accent-coloured when active, toggle off on second click) + `from` / `to` date pickers; Clear button appears when any filter is active; all filters reset on overlay close; re-search fires on any filter change |
| **Onboarding Wizard** | New signed-in users are automatically redirected to `/onboarding` where they pick interest domains (Technology & AI, Business, etc.), browse catalog podcasts and iTunes suggestions for those domains, and subscribe before reaching the dashboard; `WelcomeOnboarding` card shown as fallback if user reaches dashboard with 0 subscriptions |
| **Profile** | Responsive 2-column layout (laptop) / single-column (mobile); display name, digest toggle, **Daily / Weekly frequency toggle** (Weekly mode reveals a Mon–Sun day-of-week picker), digest hour, **per-domain email filter** — horizontally-scrollable chip row (mobile + desktop); solid orange **"All" chip** with ✓ when all domains included, color-coded domain chips when active, strikethrough + gray when excluded; "N of M included" counter top-right; "Send Digest Now" + **"Preview" button** (opens the exact email HTML in a new tab before sending); Episode Digest picker |
| **Realtime Dashboard** | `DomainInsightView` subscribes to Supabase Realtime `postgres_changes` INSERT on `insights`; when a new insight lands for the currently viewed date, the page auto-refreshes via `router.refresh()` — new cards appear without a manual reload |
| **Episode Digest** | Pick a subscribed podcast + episode → instant email (✓) or fire-and-forget async processing (○, triggers GitHub Actions); clicking "Process & Send Digest" on an unprocessed episode queues the pipeline **and automatically sends the digest email when processing completes** — no second click needed; button shows "Processing — will send when ready…" during the wait; queued episodes show ⏳ in the dropdown; queued state persisted in localStorage (20-min TTL); when pipeline completes the ⏳ flips to ✓ live via Supabase Realtime (no page refresh); if pipeline fails, the `episode_queue` table receives a `failed` status row — Realtime pushes it to the browser instantly, resetting the episode to ○ with an error message (no polling) |
| **Engagement** | Per-card: view count (auto-tracked, deduped per signed-in user), **Mark as Unread** (`EyeOff` icon — appears when a card is already read; deletes the caller's `insight_views` row so the card returns to full opacity and view count decrements; rolls back on error), like/dislike with optimistic UI and toggle-off, **copy-to-clipboard** button (writes both `text/html` and `text/plain` via `ClipboardItem` — pasting into Notion/Docs/email produces rich formatting with headings, bullets, and blockquotes; pasting into plain text gives clean ASCII; falls back to `writeText` on older browsers; icon swaps to ✓ for 2 s on success), share dropdown (Twitter/X, LinkedIn, Facebook, WhatsApp, Reddit, Telegram, Gmail, Copy link — share URL is a deep link encoding date + domain tab + card anchor so recipients land directly on the shared insight), collapsible comments panel with per-comment like/dislike and delete-own-comment; reactions and comments require sign-in; views tracked for all visitors |
| **Platform Links** | Each insight card shows a "Listen on" icon row — Spotify (green), Apple Podcasts (purple), YouTube (red), Website — linked to the correct platform; URLs auto-discovered by the pipeline: Apple via iTunes Search API (public, no key), Spotify + YouTube via Podcast 2.0 namespace tags in the RSS feed, Website from RSS `<channel><link>`; no API key required; when a new podcast is added to the catalog, a fire-and-forget `workflow_dispatch` to `backfill_platform_links.yml` runs automatically so icons appear without manual backfill |
| **Export** | Signed-in users click "↓ Export ▾" next to the date navigator to open a dropdown with three formats — **CSV** (download spreadsheet: Date, Domain, Source, Episode, Summary, Key Points, Key Quotes, Action Items, Tags; pipe-separated within cells), **JSON** (pretty-printed download with all fields as arrays), **PDF** (real binary PDF generated client-side via jsPDF — no new tab, no print dialog; insights grouped by domain with colored badges, white cards, blockquote-style quotes, section headers, page numbers, and automatic page-break logic that keeps domain badges with their content); all formats served by `GET /api/insights/export?format=csv|json|pdf&date=YYYY-MM-DD` (auth required) |
| **Bookmarks** | Signed-in users can bookmark any insight with the ☆/★ button on the engagement bar (amber when saved); toggle-style — click once to save, click again to remove; optimistic UI with server reconciliation; saved insights appear on `/saved` page sorted by bookmark date; **Saved** link in the navbar (signed-in users only) |
| **Analytics** | `/analytics` page (signed-in only) — four KPI cards (total insights, views, subscribed sources, days with insights); SVG bar chart of insights per day (last 30 days); domain breakdown with proportional horizontal bars; top-10 most-viewed insights ranked list with deep links back to the insight card |
| **About Page** | Public `/about` page — no auth required; hero, 7 feature cards with Lucide icons, and Get Started / Sign in CTA; "About" link visible in the navbar for all visitors |
| **Auth** | Supabase email + password; SSR JWT cookies; RLS enforced at DB level |
| **New Insights Indicator** | When new episodes have been processed since the user's last visit, a **"N new"** orange pill appears inline next to the Dashboard link on desktop (with a tooltip); on mobile, the Dashboard bottom-tab icon shows a count badge and a **"new"** sublabel beneath the tab text. Count is derived from `last_visited_at` on `user_profiles` vs. `insights.created_at` for the user's subscribed sources. |
| **Mobile** | Responsive layout — single-column cards, compact NavBar (My Podcasts hidden — accessible via bottom tab bar), fixed bottom tab bar (Dashboard · Podcasts · Analytics · Profile); domain filter strips are horizontally scrollable on mobile across Dashboard and Podcast Catalog |

---

## CI/CD & Deployment

- **Pipeline** (`daily_pipeline.yml`): runs **every 4 hours** (0:00, 4:00, 8:00, 12:00, 16:00, 20:00 UTC) — ingestion only (`send_email=False`).
  - `since_days` input: look-back window (default: 1)
  - `force_email` input: send digest from existing DB insights even if no new episodes (for testing)
  - `episode_audio_url` + `source_id` + `target_email` inputs: single-episode on-demand mode (triggered by `/api/digest/process`)
- **Hourly Digest** (`hourly_digest.yml`): runs every hour — checks each user's `digest_hour` in their `digest_timezone` and sends digest email to users whose local hour matches.
  - `date` input: override date (YYYY-MM-DD); defaults to today (UTC).
  - `force` input: skip the hour check and send to all eligible users immediately (`true`/`false`; default: `false`).
  - `target_email` input: restrict send to a single email address (leave blank for all users; useful for testing).
- **Weekly Recommendations** (`weekly_recommendations.yml`): runs **Sundays at 10 AM UTC (~6 AM EST)** — sends all digest-enabled users a two-section email: LLM-ranked best insights from their subscriptions + trending podcasts they aren't subscribed to in their domains.
  - `date` input: override date (YYYY-MM-DD); defaults to today.
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
