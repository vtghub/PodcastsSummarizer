import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Database } from "@/lib/database.types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(req: Request) {
  const { email, password, displayName } = await req.json().catch(() => ({}));

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true });
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Create the user_profiles row immediately using the service-role client
  // (which bypasses RLS — the user's JWT isn't valid until email confirmation).
  if (data.user) {
    const { getSupabaseClient } = await import("@/lib/supabase");
    const sb = getSupabaseClient();
    await sb.from("user_profiles").insert({
      user_id: data.user.id,
      display_name: displayName?.trim() || email.split("@")[0],
    });
  }

  return response;
}
