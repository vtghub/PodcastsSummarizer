import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/insights/[id]/engagement?view=1
// Returns views, likes, dislikes, my_reaction, comment_count in one round-trip.
// Pass ?view=1 to also record a view (called on card mount).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;

  const userId = await getUserId().catch(() => null);
  const supabase = getSupabaseClient();
  const shouldRecordView = new URL(req.url).searchParams.get("view") === "1";

  // Record view — avoid upsert because the unique index on (insight_id, user_id)
  // is a partial index (WHERE user_id IS NOT NULL), which Supabase's onConflict
  // cannot reference directly. Use select-then-insert instead.
  if (shouldRecordView) {
    if (userId) {
      const { data: existing } = await supabase
        .from("insight_views")
        .select("id")
        .eq("insight_id", insightId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) {
        await supabase
          .from("insight_views")
          .insert({ insight_id: insightId, user_id: userId });
      }
    } else {
      await supabase.from("insight_views").insert({ insight_id: insightId });
    }
  }

  // Fetch all counts in parallel
  const [viewsRes, reactionsRes, commentsRes] = await Promise.all([
    supabase.from("insight_views").select("*", { count: "exact", head: true }).eq("insight_id", insightId),
    supabase.from("insight_reactions").select("type, user_id").eq("insight_id", insightId),
    supabase.from("insight_comments").select("*", { count: "exact", head: true }).eq("insight_id", insightId),
  ]);

  const reactions = reactionsRes.data ?? [];
  const likes = reactions.filter((r) => r.type === "like").length;
  const dislikes = reactions.filter((r) => r.type === "dislike").length;
  const mine = userId ? (reactions.find((r) => r.user_id === userId)?.type ?? null) : null;

  return NextResponse.json({
    views: viewsRes.count ?? 0,
    likes,
    dislikes,
    mine,
    commentCount: commentsRes.count ?? 0,
  });
}
