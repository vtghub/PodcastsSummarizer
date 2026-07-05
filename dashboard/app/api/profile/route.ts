import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("user_profiles")
    .select("display_name, is_admin, digest_enabled, digest_hour")
    .eq("user_id", userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.display_name === "string") {
    update.display_name = body.display_name.trim() || null;
  }
  if (typeof body.digest_enabled === "boolean") {
    update.digest_enabled = body.digest_enabled;
  }
  if (typeof body.digest_hour === "number" && body.digest_hour >= 0 && body.digest_hour <= 23) {
    update.digest_hour = body.digest_hour;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const sb = getSupabaseClient();
  const { error } = await sb
    .from("user_profiles")
    .update(update)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
