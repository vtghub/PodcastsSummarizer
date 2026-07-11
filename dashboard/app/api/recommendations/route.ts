import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { runWaterfall } from "@/lib/llm-waterfall";
import { DOMAINS } from "@/lib/domain-colors";

interface InsightRow {
  id: string;
  date: string;
  domain: string;
  summary: string;
  key_points: string[];
  key_quotes: string[];
  sources: { name: string } | null;
  episodes: { title: string; title_en?: string } | null;
}

interface TrendingSource {
  id: string;
  name: string;
  domain: string;
  insight_count: number;
}

function defaultRank(insights: InsightRow[], topN: number): InsightRow[] {
  return [...insights]
    .sort((a, b) => (b.key_points?.length ?? 0) + (b.key_quotes?.length ?? 0) - ((a.key_points?.length ?? 0) + (a.key_quotes?.length ?? 0)))
    .slice(0, topN);
}

/**
 * Sources in the given domains, not already subscribed, ranked by insight
 * count in the past `days` days — mirrors get_trending_sources() in
 * worker/providers/storage/supabase_storage.py. Computed client-side (two
 * simple queries + JS aggregation) rather than a Postgres RPC, since the
 * candidate catalog is small enough that GROUP BY isn't worth a migration.
 */
async function getTrendingSources(
  sb: ReturnType<typeof getSupabaseClient>,
  domains: string[],
  excludeIds: string[],
  sinceDate: string
): Promise<TrendingSource[]> {
  const { data: candidates } = await sb
    .from("sources")
    .select("id, name, domain")
    .in("domain", domains)
    .eq("deleted", false)
    .eq("enabled", true);

  const excludeSet = new Set(excludeIds);
  const candidateSources = (candidates ?? []).filter((s: { id: string }) => !excludeSet.has(s.id));
  if (candidateSources.length === 0) return [];

  const candidateIds = candidateSources.map((s: { id: string }) => s.id);
  const { data: recentInsights } = await sb
    .from("insights")
    .select("source_id")
    .in("source_id", candidateIds)
    .gte("date", sinceDate);

  const counts = new Map<string, number>();
  for (const row of (recentInsights ?? []) as { source_id: string }[]) {
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }

  return candidateSources
    .map((s: { id: string; name: string; domain: string }) => ({
      id: s.id,
      name: s.name,
      domain: s.domain,
      insight_count: counts.get(s.id) ?? 0,
    }))
    .filter((s) => s.insight_count > 0)
    .sort((a, b) => b.insight_count - a.insight_count)
    .slice(0, 5);
}

/**
 * On-demand counterpart to the worker's weekly_recommendations job — computes
 * the same two sections (best-of-week insights, trending unsubscribed
 * podcasts) live, so a user can refresh their recommendations without
 * waiting for Sunday's email. Ranking reads llm_provider_config scope=
 * 'recommendations', same as the weekly job, but can only call the 5
 * providers this file has JS callers for (see lib/llm-waterfall.ts) — any
 * OpenRouter slots enabled there apply only to the pre-computed weekly email.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseClient();

  const { data: profile } = await sb
    .from("user_profiles")
    .select("digest_domains")
    .eq("user_id", userId)
    .maybeSingle();
  const domains: string[] = profile?.digest_domains ?? DOMAINS;

  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  const sourceIds = (subs ?? []).map((s: { source_id: string }) => s.source_id);

  if (sourceIds.length === 0) {
    return NextResponse.json({
      topInsights: [],
      recommendedSources: [],
      message: "Subscribe to some podcasts to get personalized recommendations.",
    });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: weekInsights, error: insightsError } = await sb
    .from("insights")
    .select("id, date, domain, summary, key_points, key_quotes, sources!inner(name), episodes(title, title_en)")
    .in("source_id", sourceIds)
    .gte("date", sevenDaysAgo)
    .order("date", { ascending: false });
  if (insightsError) {
    return NextResponse.json({ error: insightsError.message }, { status: 500 });
  }

  const insights = (weekInsights ?? []) as InsightRow[];

  let topInsights: InsightRow[] = [];
  let model = "heuristic";
  if (insights.length > 0) {
    const candidates = insights
      .map((i) => `[${i.id}] ${i.domain} — ${i.summary}\nKey points: ${(i.key_points ?? []).slice(0, 3).join("; ")}`)
      .join("\n\n");
    const prompt = `You are curating a weekly "best of" digest for a podcast listener interested in: ${domains.join(", ")}.

Below are candidate insights from the past week, each tagged with its id in brackets.
Pick the 5 most interesting, useful, or surprising ones for this listener — favor
variety across topics/podcasts over near-duplicates, and favor concrete, specific
insights over generic ones.

Return ONLY valid JSON matching this exact schema — no markdown, no commentary:
{"ranked_ids": ["<id of best pick>", "<id of 2nd best pick>", ...]}

Candidates:
${candidates}`;

    try {
      const { text, model: usedModel } = await runWaterfall("recommendations", prompt);
      const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned) as { ranked_ids?: string[] };
      const byId = new Map(insights.map((i) => [i.id, i]));
      const ranked = (parsed.ranked_ids ?? [])
        .map((id) => byId.get(id))
        .filter((i): i is InsightRow => Boolean(i))
        .slice(0, 5);
      if (ranked.length > 0) {
        topInsights = ranked;
        model = usedModel;
      } else {
        topInsights = defaultRank(insights, 5);
      }
    } catch (err) {
      console.error("[recommendations] LLM ranking failed, using heuristic:", err);
      topInsights = defaultRank(insights, 5);
    }
  }

  const recommendedSources = await getTrendingSources(sb, domains, sourceIds, sevenDaysAgo);

  const citations = topInsights.map((i, idx) => ({
    index: idx + 1,
    id: i.id,
    date: i.date,
    domain: i.domain,
    source_name: i.sources?.name ?? "",
    episode_title: i.episodes?.title_en || i.episodes?.title || "",
    summary: i.summary,
  }));

  return NextResponse.json({ topInsights: citations, recommendedSources, model });
}
