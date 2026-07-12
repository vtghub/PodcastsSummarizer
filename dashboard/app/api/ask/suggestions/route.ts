import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const GENERIC_FALLBACK = [
  "What are the key takeaways about AI from recent episodes?",
  "What investment strategies were discussed this week?",
  "What productivity habits do guests recommend?",
  "What health and longevity advice has been shared?",
];

const SOURCE_TEMPLATES = [
  (name: string) => `What's the latest from ${name}?`,
  (name: string) => `What are the key takeaways from ${name} recently?`,
  (name: string) => `What has ${name} covered lately?`,
];

const DOMAIN_TEMPLATES = [
  (domain: string) => `What's new in ${domain} this week?`,
  (domain: string) => `What are the key takeaways in ${domain} recently?`,
];

const GENERAL_TEMPLATES = [
  "What's trending across my subscribed podcasts this week?",
  "Summarize what I've missed this week.",
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Suggested questions for the empty-state /ask page — built deterministically
 * from the signed-in user's actual subscriptions and the last 7 days of
 * insights (podcast names, domains), not an LLM call: this is a low-value,
 * frequently-rendered UI affordance, not worth spending free-tier quota on.
 * Falls back to a generic static list when the user has no subscriptions or
 * no recent insights yet.
 */
export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ questions: GENERIC_FALLBACK });
  }

  const sb = getSupabaseClient();

  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);
  const sourceIds = (subs ?? []).map((s: { source_id: string }) => s.source_id);

  if (sourceIds.length === 0) {
    return NextResponse.json({ questions: GENERIC_FALLBACK });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: recentInsights } = await sb
    .from("insights")
    .select("domain, sources!inner(name)")
    .in("source_id", sourceIds)
    .gte("date", sevenDaysAgo);

  const rows = (recentInsights ?? []) as { domain: string; sources: { name: string } | null }[];
  if (rows.length === 0) {
    return NextResponse.json({ questions: GENERIC_FALLBACK });
  }

  const sourceNames = [...new Set(rows.map((r) => r.sources?.name).filter((n): n is string => Boolean(n)))];
  const domains = [...new Set(rows.map((r) => r.domain).filter(Boolean))];

  const candidates: string[] = [];
  shuffle(sourceNames)
    .slice(0, 4)
    .forEach((name, i) => candidates.push(SOURCE_TEMPLATES[i % SOURCE_TEMPLATES.length](name)));
  shuffle(domains)
    .slice(0, 3)
    .forEach((domain, i) => candidates.push(DOMAIN_TEMPLATES[i % DOMAIN_TEMPLATES.length](domain)));
  candidates.push(...GENERAL_TEMPLATES);

  const questions = shuffle(candidates).slice(0, 6);
  return NextResponse.json({ questions: questions.length > 0 ? questions : GENERIC_FALLBACK });
}
