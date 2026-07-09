import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// DELETE /api/insights/[id]/engagement/unread
// Removes the caller's view record for this insight, marking it unread.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: insightId } = await params;
  const userId = await getUserId().catch(() => null);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("insight_views")
    .delete()
    .eq("insight_id", insightId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
