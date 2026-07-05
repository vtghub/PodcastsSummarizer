/**
 * Edge middleware — two responsibilities:
 *
 * 1. Session refresh: calls supabase.auth.getUser() on every request so
 *    Supabase can rotate short-lived JWTs and write the updated token back
 *    into the response cookies. Without this, sessions expire after 1 hour.
 *
 * 2. Auth guard: blocks unauthenticated requests to /api/sources (admin) and
 *    /api/subscriptions (any signed-in user) with a 401 JSON response.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function middleware(request: NextRequest) {
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
