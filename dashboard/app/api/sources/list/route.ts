import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

// GET /api/sources/list — returns {id, name, domain} for all enabled public sources.
// Used by the search overlay's Podcast filter dropdown.
export async function GET() {
  const sb = getSupabaseClient();
  const { data, error } = await sb
    .from("sources")
    .select("id, name, domain")
    .eq("enabled", true)
    .eq("is_public", true)
    .eq("deleted", false)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sources: data ?? [] });
}
