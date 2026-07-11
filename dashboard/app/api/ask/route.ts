import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";
import { runWaterfall } from "@/lib/llm-waterfall";

async function generateAnswer(prompt: string): Promise<{ text: string; model: string }> {
  return runWaterfall("ask_ai", prompt);
}

// ── Route ─────────────────────────────────────────────────────────────────────

interface InsightRow {
  id: string;
  date: string;
  domain: string;
  summary: string;
  key_points: string[];
  key_quotes: string[];
  action_items: string[];
  sources: { name: string } | null;
  episodes: { title: string; title_en?: string } | null;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let question: string;
  try {
    const body = await request.json();
    question = (body.question ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!question || question.length < 3) {
    return NextResponse.json({ error: "Question is too short" }, { status: 400 });
  }

  const sb = getSupabaseClient();

  // Get user's subscribed source IDs
  const { data: subs } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", userId)
    .eq("enabled", true);

  const subscribedSourceIds = (subs ?? []).map((s: { source_id: string }) => s.source_id);

  const insightSelect =
    "id, date, domain, summary, key_points, key_quotes, action_items, sources!inner(name), episodes(title, title_en)";

  // 0. Does the question name a specific subscribed podcast? FTS below searches insight
  // content (summaries/quotes), not podcast names — so "what's the latest from <show>"
  // finds nothing unless the show name happens to appear inside an insight's text. When a
  // subscribed source is named directly, go fetch that source's own insights first so the
  // answer is grounded in the right podcast instead of falling back to unrelated recent ones.
  let namedSourceInsights: InsightRow[] = [];
  let namedSourceWithNoInsights: string | null = null;

  if (subscribedSourceIds.length > 0) {
    const { data: subSources } = await sb
      .from("sources")
      .select("id, name")
      .in("id", subscribedSourceIds);

    const questionLower = question.toLowerCase();
    let mentionedSources = (subSources ?? []).filter(
      (s: { id: string; name: string }) => s.name.length >= 4 && questionLower.includes(s.name.toLowerCase())
    );

    // Some catalog names contain another's as a substring (e.g. "Claude AI" is
    // itself a substring of "Claude AI Genius Podcast ..."), so mentioning the
    // longer name spuriously also "mentions" the shorter one. Keep only the
    // most specific (longest) match(es) so its insights aren't crowded out.
    mentionedSources = mentionedSources.filter(
      (s: { name: string }) =>
        !mentionedSources.some(
          (other: { name: string }) =>
            other.name.length > s.name.length && other.name.toLowerCase().includes(s.name.toLowerCase())
        )
    );

    if (mentionedSources.length > 0) {
      // Fetch each mentioned source's insights separately (rather than one
      // shared-limit query) so a prolific podcast can't crowd out a quieter
      // one when more than one is named in the same question.
      const perSourceResults = await Promise.all(
        mentionedSources.map((s: { id: string }) =>
          sb
            .from("insights")
            .select(insightSelect)
            .eq("source_id", s.id)
            .order("date", { ascending: false })
            .limit(5)
        )
      );
      namedSourceInsights = perSourceResults.flatMap((r) => (r.data ?? []) as InsightRow[]);

      if (namedSourceInsights.length === 0 && mentionedSources.length === 1) {
        namedSourceWithNoInsights = mentionedSources[0].name;
      }
    }
  }

  // A named podcast is subscribed but has no processed episodes yet — answer honestly
  // instead of letting the LLM see unrelated context and guess.
  if (namedSourceWithNoInsights) {
    return NextResponse.json({
      answer:
        `You're subscribed to ${namedSourceWithNoInsights}, but no episodes from it have been processed into insights yet. ` +
        `Episodes are picked up automatically every few hours, or you can process one now from the Episode Digest section on your Profile page.`,
      citations: [],
    });
  }

  // 1. FTS search restricted to user's subscriptions
  let ftsQuery = sb
    .from("insights")
    .select(insightSelect)
    .textSearch("search_vector", question, { type: "websearch", config: "english" })
    .order("date", { ascending: false })
    .limit(8);

  if (subscribedSourceIds.length > 0) {
    ftsQuery = ftsQuery.in("source_id", subscribedSourceIds);
  }

  const { data: ftsData, error: searchError } = await ftsQuery;
  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  let insights: InsightRow[] = (ftsData ?? []) as InsightRow[];

  // Merge in the named-podcast insights (if any), prioritized first and deduped
  if (namedSourceInsights.length > 0) {
    const merged = [...namedSourceInsights];
    for (const ins of insights) {
      if (!merged.some((m) => m.id === ins.id)) merged.push(ins);
    }
    insights = merged.slice(0, 8);
  }

  // 2. Fallback: most recent insights from subscriptions
  if (insights.length === 0 && subscribedSourceIds.length > 0) {
    const { data: recentData } = await sb
      .from("insights")
      .select(insightSelect)
      .in("source_id", subscribedSourceIds)
      .order("date", { ascending: false })
      .limit(8);
    insights = (recentData ?? []) as InsightRow[];
  }

  if (insights.length === 0) {
    return NextResponse.json({
      answer:
        "I couldn't find any insights in your subscribed podcasts yet. Subscribe to some podcasts and check back once episodes have been processed.",
      citations: [],
    });
  }

  // Build context
  const contextText = insights
    .map((ins, i) => {
      const source = ins.sources?.name ?? "Unknown source";
      const episode = ins.episodes?.title_en || ins.episodes?.title || "";
      const keyPoints = (ins.key_points ?? []).slice(0, 3).join("\n  - ");
      const quotes = (ins.key_quotes ?? []).slice(0, 2).join("\n  > ");
      return [
        `[${i + 1}] ${source}${episode ? ` — "${episode}"` : ""} (${ins.domain}, ${ins.date})`,
        `Summary: ${ins.summary}`,
        keyPoints ? `Key points:\n  - ${keyPoints}` : "",
        quotes ? `Quotes:\n  > ${quotes}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  const prompt = `You are a helpful assistant that answers questions based on podcast insights.

A user subscribes to several podcasts. Below are the most relevant insight summaries from their subscribed episodes. For any single podcast, its entries are listed newest episode first. If the user asks for the "latest" or "most recent" episode from a specific podcast, that is simply the first entry belonging to that podcast in the list below — you don't need to compare dates yourself. Answer the user's question using only this context. Be concise, specific, and cite which source(s) you draw from using [1], [2], etc. If the context doesn't adequately answer the question, say so honestly rather than guessing.

=== PODCAST INSIGHTS ===
${contextText}
=== END INSIGHTS ===

User question: ${question}

Answer:`;

  try {
    const { text, model } = await generateAnswer(prompt);

    const citations = insights.map((ins, i) => ({
      index: i + 1,
      id: ins.id,
      date: ins.date,
      domain: ins.domain,
      source_name: ins.sources?.name ?? "",
      episode_title: ins.episodes?.title_en || ins.episodes?.title || "",
    }));

    return NextResponse.json({ answer: text, citations, model });
  } catch (err) {
    console.error("[ask] all providers failed:", err);
    return NextResponse.json(
      { error: "All AI providers are currently unavailable. Please try again later." },
      { status: 503 }
    );
  }
}
