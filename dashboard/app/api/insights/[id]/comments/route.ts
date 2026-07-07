import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/insights/[id]/comments — list comments with reaction counts + display names
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId().catch(() => null);
  const supabase = getSupabaseClient();

  const { data: comments, error } = await supabase
    .from("insight_comments")
    .select("id, body, created_at, user_id")
    .eq("insight_id", insightId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!comments?.length) return NextResponse.json({ comments: [] });

  // Fetch display names from user_profiles
  const userIds = [...new Set(comments.map((c) => c.user_id))];
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.user_id, p.display_name]));

  // Fetch comment reactions
  const commentIds = comments.map((c) => c.id);
  const { data: reactions } = await supabase
    .from("comment_reactions")
    .select("comment_id, type, user_id")
    .in("comment_id", commentIds);

  const result = comments.map((c) => {
    const cr = reactions?.filter((r) => r.comment_id === c.id) ?? [];
    return {
      id: c.id,
      body: c.body,
      created_at: c.created_at,
      user_id: c.user_id,
      display_name: nameMap[c.user_id] ?? "User",
      likes: cr.filter((r) => r.type === "like").length,
      dislikes: cr.filter((r) => r.type === "dislike").length,
      my_reaction: userId ? (cr.find((r) => r.user_id === userId)?.type ?? null) : null,
      is_mine: c.user_id === userId,
    };
  });

  return NextResponse.json({ comments: result });
}

// POST /api/insights/[id]/comments — post a comment
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json().catch(() => ({})) as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });
  if (body.length > 2000) return NextResponse.json({ error: "Comment too long" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("insight_comments")
    .insert({ insight_id: insightId, user_id: userId, body: body.trim() })
    .select("id, body, created_at, user_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .single();

  return NextResponse.json({
    comment: {
      ...data,
      display_name: profile?.display_name ?? "User",
      likes: 0,
      dislikes: 0,
      my_reaction: null,
      is_mine: true,
    },
  });
}
