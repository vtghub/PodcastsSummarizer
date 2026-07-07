import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// POST /api/insights/[id]/view — record a view (idempotent for signed-in users)
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId().catch(() => null);
  const supabase = getSupabaseClient();

  if (userId) {
    // Upsert — unique index on (insight_id, user_id) prevents duplicates
    await supabase.from("insight_views").upsert(
      { insight_id: insightId, user_id: userId },
      { onConflict: "insight_id,user_id", ignoreDuplicates: true }
    );
  } else {
    // Anonymous view — always insert
    await supabase.from("insight_views").insert({ insight_id: insightId });
  }

  const { count } = await supabase
    .from("insight_views")
    .select("*", { count: "exact", head: true })
    .eq("insight_id", insightId);

  return NextResponse.json({ views: count ?? 0 });
}

// GET /api/insights/[id]/view — fetch view count
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const supabase = getSupabaseClient();

  const { count } = await supabase
    .from("insight_views")
    .select("*", { count: "exact", head: true })
    .eq("insight_id", insightId);

  return NextResponse.json({ views: count ?? 0 });
}
