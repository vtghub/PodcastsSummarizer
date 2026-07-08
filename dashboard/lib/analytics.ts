import { getSupabaseClient } from "./supabase";

export interface DomainStat {
  domain: string;
  insights: number;
  views: number;
}

export interface DayCount {
  date: string;
  count: number;
}

export interface TopInsight {
  id: string;
  summary: string;
  domain: string;
  date: string;
  source_name: string;
  views: number;
}

export interface AnalyticsData {
  totals: { insights: number; views: number; sources: number; days: number };
  insights_by_day: DayCount[];
  domain_stats: DomainStat[];
  top_insights: TopInsight[];
}

type InsightRow = {
  id: string;
  date: string;
  domain: string;
  summary: string;
  source_id: string;
  sources: { name: string } | null;
};

type ViewRow = { insight_id: string };

export async function getNewInsightCount(userId: string): Promise<number> {
  const sb = getSupabaseClient();

  const { data: profile } = await sb
    .from("user_profiles")
    .select("last_visited_at")
    .eq("user_id", userId)
    .single();

  if (!profile?.last_visited_at) return 0;

  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);

  const sourceIds = (subs ?? []).map((r: { source_id: string }) => r.source_id);
  if (sourceIds.length === 0) return 0;

  const { count } = await sb
    .from("insights")
    .select("id", { count: "exact", head: true })
    .in("source_id", sourceIds)
    .gt("created_at", profile.last_visited_at);

  return count ?? 0;
}

export async function getAnalytics(userId: string): Promise<AnalyticsData> {
  const sb = getSupabaseClient();

  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  const sourceIds = (subs ?? []).map((r: { source_id: string }) => r.source_id);

  const { data: rawInsights } = sourceIds.length > 0
    ? await sb
        .from("insights")
        .select("id, date, domain, summary, source_id, sources(name)")
        .in("source_id", sourceIds)
    : { data: [] };

  const insights = (rawInsights ?? []) as InsightRow[];
  const insightIds = insights.map((i) => i.id);

  const { data: rawViews } = insightIds.length > 0
    ? await sb.from("insight_views").select("insight_id").in("insight_id", insightIds)
    : { data: [] };

  const views = (rawViews ?? []) as ViewRow[];

  // Build view-count map
  const viewCountMap: Record<string, number> = {};
  for (const v of views) {
    viewCountMap[v.insight_id] = (viewCountMap[v.insight_id] ?? 0) + 1;
  }

  // Aggregate domain stats and day counts
  const domainMap: Record<string, { insights: number; views: number }> = {};
  const dayMap: Record<string, number> = {};

  for (const ins of insights) {
    domainMap[ins.domain] ??= { insights: 0, views: 0 };
    domainMap[ins.domain].insights++;
    domainMap[ins.domain].views += viewCountMap[ins.id] ?? 0;
    dayMap[ins.date] = (dayMap[ins.date] ?? 0) + 1;
  }

  const domain_stats: DomainStat[] = Object.entries(domainMap)
    .map(([domain, s]) => ({ domain, ...s }))
    .sort((a, b) => b.insights - a.insights);

  const insights_by_day: DayCount[] = Object.entries(dayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const top_insights: TopInsight[] = insights
    .map((ins) => ({
      id: ins.id,
      summary: ins.summary.length > 120 ? ins.summary.slice(0, 120) + "…" : ins.summary,
      domain: ins.domain,
      date: ins.date,
      source_name: ins.sources?.name ?? "",
      views: viewCountMap[ins.id] ?? 0,
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const totalViews = views.length;

  return {
    totals: {
      insights: insights.length,
      views: totalViews,
      sources: sourceIds.length,
      days: Object.keys(dayMap).length,
    },
    insights_by_day,
    domain_stats,
    top_insights,
  };
}
