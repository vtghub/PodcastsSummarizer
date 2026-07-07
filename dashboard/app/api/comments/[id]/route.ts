import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// DELETE /api/comments/[id] — delete own comment
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const commentId = parseInt(id, 10);
  if (isNaN(commentId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from("insight_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", userId); // RLS + app-level guard

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
