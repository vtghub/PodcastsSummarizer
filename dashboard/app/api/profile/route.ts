import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type ProfileUpdate = Database["public"]["Tables"]["user_profiles"]["Update"];

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("user_profiles")
    .select("display_name, is_admin, digest_enabled, digest_hour, digest_domains, digest_frequency, digest_day_of_week, digest_timezone")
    .eq("user_id", userId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const update: ProfileUpdate = {};

  if (typeof body.display_name === "string") {
    update.display_name = body.display_name.trim() || null;
  }
  if (typeof body.digest_enabled === "boolean") {
    update.digest_enabled = body.digest_enabled;
  }
  if (typeof body.digest_hour === "number" && body.digest_hour >= 0 && body.digest_hour <= 23) {
    update.digest_hour = body.digest_hour;
  }
  if ("digest_domains" in body) {
    const dd = body.digest_domains;
    update.digest_domains = (Array.isArray(dd) && dd.length > 0) ? dd : null;
  }
  if (body.digest_frequency === "daily" || body.digest_frequency === "weekly") {
    update.digest_frequency = body.digest_frequency;
  }
  if (typeof body.digest_day_of_week === "number" && body.digest_day_of_week >= 0 && body.digest_day_of_week <= 6) {
    update.digest_day_of_week = body.digest_day_of_week;
  }
  if (typeof body.digest_timezone === "string" && body.digest_timezone.trim()) {
    update.digest_timezone = body.digest_timezone.trim();
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
