import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/insights/[id]/bookmark — is this insight bookmarked by the current user?
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ bookmarked: false });

  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("insight_bookmarks")
    .select("id")
    .eq("insight_id", insightId)
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ bookmarked: !!data });
}

// POST /api/insights/[id]/bookmark — toggle bookmark on/off
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from("insight_bookmarks")
    .select("id")
    .eq("insight_id", insightId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabase.from("insight_bookmarks").delete().eq("id", existing.id);
    return NextResponse.json({ bookmarked: false });
  }

  await supabase.from("insight_bookmarks").insert({ insight_id: insightId, user_id: userId });
  return NextResponse.json({ bookmarked: true });
}
