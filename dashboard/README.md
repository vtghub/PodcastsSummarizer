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
| `/podcasts` | Auth-gated | Manage podcast sources |
| `/login` | Public | Passcode login form |

## Auth

The `/podcasts` page and all `/api/sources` endpoints require a valid session cookie.

**Flow:**
1. `POST /api/auth/login` — validates `passcode` against `ADMIN_SECRET` env var; sets an HTTP-only `admin_session` cookie containing `SHA-256(ADMIN_SECRET)`
2. `middleware.ts` (Edge) — validates cookie on every request to `/podcasts` and `/api/sources`; redirects to `/login` if invalid
3. `POST /api/auth/logout` — clears the cookie

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `ADMIN_SECRET` | Passcode for the My Podcasts page |

## Theming

Themes are defined as JavaScript objects in `contexts/ThemeContext.tsx` and applied via `document.documentElement.style.setProperty()` at runtime. This avoids a Tailwind 4 + Turbopack limitation where custom `:root` blocks in CSS files are stripped from the output bundle.

Five built-in themes: **Anthropic Light**, **Midnight**, **Aurora**, **Dusk**, **Forest**.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
```

Set `ADMIN_SECRET` in `.env.local` for local auth testing:

```
ADMIN_SECRET=your-passcode-here
```
