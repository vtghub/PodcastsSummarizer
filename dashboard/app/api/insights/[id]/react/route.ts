import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/insights/[id]/react — fetch counts + current user's reaction
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId().catch(() => null);
  const supabase = getSupabaseClient();

  const { data: rows } = await supabase
    .from("insight_reactions")
    .select("type, user_id")
    .eq("insight_id", insightId);

  const likes = rows?.filter((r) => r.type === "like").length ?? 0;
  const dislikes = rows?.filter((r) => r.type === "dislike").length ?? 0;
  const mine = userId ? (rows?.find((r) => r.user_id === userId)?.type ?? null) : null;

  return NextResponse.json({ likes, dislikes, mine });
}

// POST /api/insights/[id]/react — toggle like/dislike
// body: { type: "like" | "dislike" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await req.json().catch(() => ({})) as { type?: string };
  if (type !== "like" && type !== "dislike") {
    return NextResponse.json({ error: "type must be like or dislike" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  // Check existing reaction
  const { data: existing } = await supabase
    .from("insight_reactions")
    .select("id, type")
    .eq("insight_id", insightId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    if (existing.type === type) {
      // Same type → remove (toggle off)
      await supabase.from("insight_reactions").delete().eq("id", existing.id);
    } else {
      // Different type → update
      await supabase.from("insight_reactions").update({ type }).eq("id", existing.id);
    }
  } else {
    await supabase.from("insight_reactions").insert({ insight_id: insightId, user_id: userId, type });
  }

  // Return updated counts
  const { data: rows } = await supabase
    .from("insight_reactions")
    .select("type, user_id")
    .eq("insight_id", insightId);

  const likes = rows?.filter((r) => r.type === "like").length ?? 0;
  const dislikes = rows?.filter((r) => r.type === "dislike").length ?? 0;
  const mine = rows?.find((r) => r.user_id === userId)?.type ?? null;

  return NextResponse.json({ likes, dislikes, mine });
}
