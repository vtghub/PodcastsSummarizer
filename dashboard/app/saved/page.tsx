import { getUserId } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import type { Insight } from "@/lib/db";
import SavedInsightsList from "@/components/SavedInsightsList";

async function getBookmarkedInsights(userId: string): Promise<Insight[]> {
  const supabase = getSupabaseClient();

  const { data: bookmarks } = await supabase
    .from("insight_bookmarks")
    .select("insight_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!bookmarks || bookmarks.length === 0) return [];

  const ids = bookmarks.map((b) => b.insight_id);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insightRows } = await (supabase as any)
    .from("insights")
    .select(`
      id, episode_id, source_id, domain, date, summary,
      key_points, key_quotes, action_items, tags, created_at,
      episodes(title, published_at),
      sources(name, platform_links)
    `)
    .in("id", ids);

  if (!insightRows) return [];

  // Preserve bookmark order (most recently bookmarked first)
  const order = new Map(ids.map((id, i) => [id, i]));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (insightRows as any[])
    .map((row) => {
      const ep = row.episodes as { title?: string; published_at?: string } | null;
      const src = row.sources as { name?: string; platform_links?: Record<string, string> } | null;
      return {
        id: row.id,
        episode_id: row.episode_id,
        source_id: row.source_id,
        domain: row.domain,
        date: row.date,
        summary: row.summary,
        key_points: (row.key_points as string[]) ?? [],
        key_quotes: (row.key_quotes as string[]) ?? [],
        action_items: (row.action_items as string[]) ?? [],
        tags: (row.tags as string[]) ?? [],
        created_at: row.created_at,
        source_name: src?.name,
        episode_title: ep?.title,
        episode_published_at: ep?.published_at,
        platform_links: src?.platform_links as Insight["platform_links"],
      } satisfies Insight;
    })
    .sort((a: Insight, b: Insight) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export default async function SavedPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?from=/saved");

  const insights = await getBookmarkedInsights(userId);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Saved Insights</h1>
        <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
          {insights.length === 0
            ? "Bookmark insights from the dashboard to find them here."
            : `${insights.length} bookmarked insight${insights.length !== 1 ? "s" : ""}`}
        </p>
      </div>
      <SavedInsightsList insights={insights} />
    </div>
  );
}
