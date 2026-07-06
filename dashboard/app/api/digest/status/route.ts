import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const episodeId = req.nextUrl.searchParams.get("episodeId");
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const sb = getSupabaseClient();
  const { data } = await sb
    .from("insights")
    .select("id")
    .eq("episode_id", episodeId)
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ processed: Boolean(data) });
}
