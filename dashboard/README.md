# Podcast Insights — Dashboard

Next.js 15 web dashboard for browsing daily podcast insights and managing podcast sources.

## Stack

- **Next.js 15** (App Router, Turbopack)
- **Tailwind CSS 4** with runtime CSS variable theming
- **Supabase** (Postgres) for data
- **Vercel** for deployment
- **Web Speech API** for text-to-speech

## Pages

| Route | Access | Description |
|---|---|---|
| `/` | Public | Home / landing |
| `/dashboard` | Public | Daily Insights grouped by domain |
| `/podcasts` | Public | Podcast sources — read-only for guests, full management when signed in |
| `/login` | Public | Passcode login form |

## Auth

Only the `/api/sources` mutation endpoints require a valid session cookie. The `/podcasts` page is publicly accessible but renders in read-only mode for unauthenticated visitors.

**Flow:**
1. `POST /api/auth/login` — validates `passcode` against `ADMIN_SECRET` env var; sets an HTTP-only `admin_session` cookie containing `SHA-256(ADMIN_SECRET)`
2. `middleware.ts` (Edge) — validates cookie on requests to `/api/sources`; returns 401 if invalid
3. `podcasts/page.tsx` — checks auth server-side via `isValidSession()`; passes `isAuthed` to `PodcastManager`; guests see read-only list with "Sign in to manage" banner
4. `POST /api/auth/logout` — clears the cookie; page reverts to read-only mode

**Login redirect:** Uses `window.location.href` (not `router.push`) after successful login to force a full browser navigation, ensuring the Edge middleware receives the new cookie immediately.

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL (server-side only) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (server-side only) |
| `ADMIN_SECRET` | Passcode for the podcast management UI |

## Theming

Themes are defined as JavaScript objects in `contexts/ThemeContext.tsx` and applied via `document.documentElement.style.setProperty()` at runtime. This avoids a Tailwind 4 + Turbopack limitation where custom `:root` blocks in CSS files are stripped from the output bundle.

Five built-in themes: **Light**, **Midnight**, **Aurora**, **Dusk**, **Forest**.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
```

Set `ADMIN_SECRET` in `.env.local` for local auth testing:

```
ADMIN_SECRET=your-passcode-here
```
