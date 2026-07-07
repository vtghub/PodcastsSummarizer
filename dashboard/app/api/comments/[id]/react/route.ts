import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/comments/[id]/react — toggle like/dislike on a comment
// body: { type: "like" | "dislike" }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const { id } = await params;
  const commentId = parseInt(id, 10);
  if (isNaN(commentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await req.json().catch(() => ({})) as { type?: string };
  if (type !== "like" && type !== "dislike") {
    return NextResponse.json({ error: "type must be like or dislike" }, { status: 400 });
  }

  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from("comment_reactions")
    .select("id, type")
    .eq("comment_id", commentId)
    .eq("user_id", userId)
    .single();

  if (existing) {
    if (existing.type === type) {
      await supabase.from("comment_reactions").delete().eq("id", existing.id);
    } else {
      await supabase.from("comment_reactions").update({ type }).eq("id", existing.id);
    }
  } else {
    await supabase.from("comment_reactions").insert({ comment_id: commentId, user_id: userId, type });
  }

  const { data: rows } = await supabase
    .from("comment_reactions")
    .select("type, user_id")
    .eq("comment_id", commentId);

  return NextResponse.json({
    likes: rows?.filter((r) => r.type === "like").length ?? 0,
    dislikes: rows?.filter((r) => r.type === "dislike").length ?? 0,
    mine: rows?.find((r) => r.user_id === userId)?.type ?? null,
  });
}
