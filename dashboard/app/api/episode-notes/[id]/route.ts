import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const MAX_BODY_LENGTH = 4000;

// PATCH /api/episode-notes/[id] — edit own note (used by debounced autosave)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (isNaN(noteId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json().catch(() => ({})) as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) return NextResponse.json({ error: "Note too long" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("episode_notes")
    .update({ body: body.trim(), updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("user_id", userId) // RLS + app-level guard
    .select("id, body, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

// DELETE /api/episode-notes/[id] — delete own note
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = parseInt(id, 10);
  if (isNaN(noteId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("episode_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", userId); // RLS + app-level guard

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
