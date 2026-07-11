import { NextResponse } from "next/server";
import { getSupabaseClient } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q        = searchParams.get("q")?.trim() ?? "";
  const domain   = searchParams.get("domain")?.trim() ?? "";
  const from     = searchParams.get("from")?.trim() ?? "";
  const to       = searchParams.get("to")?.trim() ?? "";
  const sourceId = searchParams.get("source")?.trim() ?? "";

  if (q.length < 2) return NextResponse.json({ results: [] });

  const sb = getSupabaseClient();
  let query = sb
    .from("insights")
    .select("id, date, domain, summary, sources!inner(name), episodes(title, title_en)")
    .textSearch("search_vector", q, { type: "websearch", config: "english" });

  if (domain)   query = query.eq("domain", domain);
  if (from)     query = query.gte("date", from);
  if (to)       query = query.lte("date", to);
  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query.order("date", { ascending: false }).limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = (data ?? []).map((r: Record<string, unknown>) => ({
    id: r.id,
    date: r.date,
    domain: r.domain,
    summary: (r.summary as string)?.slice(0, 160),
    source_name: (r.sources as { name: string } | null)?.name,
    episode_title: (r.episodes as { title: string; title_en?: string } | null)?.title_en
      || (r.episodes as { title: string } | null)?.title,
  }));

  return NextResponse.json({ results });
}
