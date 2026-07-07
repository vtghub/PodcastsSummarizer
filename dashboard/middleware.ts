/**
 * Edge middleware — three responsibilities:
 *
 * 1. Session refresh: calls supabase.auth.getUser() on every request so
 *    Supabase can rotate short-lived JWTs and write the updated token back
 *    into the response cookies. Without this, sessions expire after 1 hour.
 *
 * 2. Auth guard: blocks unauthenticated requests to /api/sources (admin) and
 *    /api/subscriptions (any signed-in user) with a 401 JSON response.
 *
 * 3. Rate limiting: token-bucket per IP on comment/reaction mutation routes.
 *    20 requests/minute with a burst capacity of 20. Per-instance (edge node),
 *    which is sufficient to stop accidental runaway clients.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ── Token-bucket rate limiter ────────────────────────────────────────────────
// Routes that mutate engagement data (comments, reactions) are rate-limited.
const RATE_LIMIT_PATHS = [
  "/api/insights/",  // POST .../comments, POST .../react
  "/api/comments/",  // POST/DELETE .../react, DELETE ...
];
const RATE_LIMIT_METHODS = new Set(["POST", "DELETE", "PATCH"]);
const BUCKET_CAPACITY = 20;   // max burst
const REFILL_RATE = 20 / 60;  // tokens per ms → 20 per minute

type Bucket = { tokens: number; lastMs: number };
const _buckets = new Map<string, Bucket>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let b = _buckets.get(ip);
  if (!b) {
    b = { tokens: BUCKET_CAPACITY - 1, lastMs: now };
    _buckets.set(ip, b);
    return true;
  }
  const refill = (now - b.lastMs) * REFILL_RATE;
  b.tokens = Math.min(BUCKET_CAPACITY, b.tokens + refill);
  b.lastMs = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function middleware(request: NextRequest) {
  const { pathname, method } = { pathname: request.nextUrl.pathname, method: request.method };

  // Rate-limit engagement mutation routes.
  if (
    RATE_LIMIT_METHODS.has(method) &&
    RATE_LIMIT_PATHS.some((p) => pathname.startsWith(p))
  ) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  // Start with a pass-through response that carries the original request headers.
  let supabaseResponse = NextResponse.next({ request });

  // If Supabase isn't configured (local dev without env vars) skip auth checks.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return supabaseResponse;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        // Write updated tokens into both the request (for downstream middleware)
        // and the response (sent back to the browser).
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: getUser() must be called — it triggers token refresh.
  // Do NOT replace with getSession(); it reads a cached, unverified token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // /api/sources — admin-only CRUD for the global podcast catalog
  if (!user && pathname.startsWith("/api/sources")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // /api/subscriptions — requires any authenticated user (Phase 2)
  if (!user && pathname.startsWith("/api/subscriptions")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // /api/profile — requires any authenticated user (Phase 4)
  if (!user && pathname.startsWith("/api/profile")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return supabaseResponse;
}

export const config = {
  // Run on every route except Next.js internals and static assets.
  // The session refresh must happen on page loads, not just API calls.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
