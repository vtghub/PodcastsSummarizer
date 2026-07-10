import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();

  const [{ data: authUsers, error: authError }, { data: profiles, error: profileError }, { data: subs }] =
    await Promise.all([
      sb.auth.admin.listUsers({ perPage: 1000 }),
      sb.from("user_profiles").select("user_id, display_name, is_admin, digest_enabled, created_at"),
      sb.from("user_subscriptions").select("user_id").eq("enabled", true),
    ]);

  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });
  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 });

  const profileByUserId = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const subCountByUserId = new Map<string, number>();
  for (const s of subs ?? []) {
    subCountByUserId.set(s.user_id, (subCountByUserId.get(s.user_id) ?? 0) + 1);
  }

  const users = (authUsers?.users ?? []).map((u) => {
    const profile = profileByUserId.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      display_name: profile?.display_name ?? null,
      is_admin: Boolean(profile?.is_admin),
      digest_enabled: profile?.digest_enabled ?? false,
      subscription_count: subCountByUserId.get(u.id) ?? 0,
      email_confirmed: Boolean(u.email_confirmed_at),
      created_at: profile?.created_at ?? u.created_at,
      has_profile: Boolean(profile),
    };
  });

  users.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  return NextResponse.json({ users });
}
