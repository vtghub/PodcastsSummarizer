import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// POST /api/profile/visit — stamp last_visited_at = NOW() for the signed-in user.
// Called client-side on dashboard mount so the next visit can compute new-since-last-visit count.
export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = getSupabaseClient();
  await supabase
    .from("user_profiles")
    .update({ last_visited_at: new Date().toISOString() })
    .eq("user_id", userId);

  return NextResponse.json({ ok: true });
}
