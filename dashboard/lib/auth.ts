/**
 * Auth helpers — Supabase Auth (email + password, JWT, SSR cookies).
 *
 * Uses @supabase/ssr to create server-side clients that automatically
 * read/write Supabase session cookies. The middleware refreshes tokens
 * on every request so sessions stay alive without client-side intervention.
 *
 * getUser() is wrapped in React cache() so multiple Server Components
 * calling it in the same render incur only one network round-trip.
 */

import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** Build a Supabase SSR client bound to the current request's cookies. */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Components rendered inside a layout cannot set cookies.
          // The middleware handles token refresh so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Returns the currently signed-in Supabase user, or null.
 * Memoised per request via React cache() — safe to call from multiple
 * Server Components without duplicating the Supabase network call.
 */
export const getUser = cache(async () => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const supabase = await createAuthClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
});

/** Returns the UUID of the signed-in user, or null. */
export async function getUserId(): Promise<string | null> {
  const user = await getUser();
  return user?.id ?? null;
}

/**
 * Returns true if the signed-in user has is_admin = true in user_profiles.
 * Uses the service-role client so it bypasses RLS — safe for server-side checks.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;

  // Lazy-import to avoid pulling the service-role client into client bundles
  const { getSupabaseClient } = await import("./supabase");
  const sb = getSupabaseClient();
  const { data } = await sb
    .from("user_profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  return Boolean(data?.is_admin);
}
