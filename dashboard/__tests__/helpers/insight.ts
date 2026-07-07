import type { Insight } from "@/lib/db";

export function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: "insight-1",
    episode_id: "ep-1",
    source_id: "src-1",
    domain: "Technology & AI",
    date: "2026-07-07",
    summary: "A look at the latest AI trends.",
    key_points: ["AI is accelerating", "Jobs are changing", "New tools emerging"],
    key_quotes: ["The future is already here."],
    action_items: ["Experiment with AI tools", "Upskill your team"],
    tags: ["AI", "Technology"],
    created_at: "2026-07-07T00:00:00Z",
    source_name: "Big Tech Podcast",
    episode_title: "AI Takes Over Everything",
    episode_published_at: "2026-07-06T00:00:00Z",
    platform_links: undefined,
    ...overrides,
  };
}
