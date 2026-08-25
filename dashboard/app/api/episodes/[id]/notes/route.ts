import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const MAX_BODY_LENGTH = 4000;

// GET /api/episodes/[id]/notes — list the signed-in user's notes for this episode
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseClient();
  const { data: notes, error } = await supabase
    .from("episode_notes")
    .select("id, body, created_at, updated_at")
    .eq("episode_id", episodeId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ notes: notes ?? [] });
}

// POST /api/episodes/[id]/notes — add a new note
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: episodeId } = await params;
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { body } = await req.json().catch(() => ({})) as { body?: string };
  if (!body?.trim()) return NextResponse.json({ error: "body required" }, { status: 400 });
  if (body.length > MAX_BODY_LENGTH) return NextResponse.json({ error: "Note too long" }, { status: 400 });

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("episode_notes")
    .insert({ episode_id: episodeId, user_id: userId, body: body.trim() })
    .select("id, body, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}
