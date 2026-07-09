import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

interface InsightRow {
  id: string;
  date: string;
  domain: string;
  summary: string;
  key_points: string[];
  key_quotes: string[];
  action_items: string[];
  sources: { name: string } | null;
  episodes: { title: string } | null;
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Q&A is not configured (missing GEMINI_API_KEY)" },
      { status: 503 }
    );
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

  // Search insights via FTS, restricted to user's subscriptions
  let query = sb
    .from("insights")
    .select(
      "id, date, domain, summary, key_points, key_quotes, action_items, sources!inner(name), episodes(title)"
    )
    .textSearch("search_vector", question, { type: "websearch", config: "english" })
    .order("date", { ascending: false })
    .limit(8);

  if (subscribedSourceIds.length > 0) {
    query = query.in("source_id", subscribedSourceIds);
  }

  const { data: searchData, error: searchError } = await query;

  if (searchError) {
    return NextResponse.json({ error: searchError.message }, { status: 500 });
  }

  const insights: InsightRow[] = (searchData ?? []) as InsightRow[];

  if (insights.length === 0) {
    return NextResponse.json({
      answer:
        "I couldn't find any relevant insights in your subscribed podcasts for that question. Try rephrasing or exploring different keywords.",
      citations: [],
    });
  }

  // Build context block
  const contextBlocks = insights.map((ins, i) => {
    const source = ins.sources?.name ?? "Unknown source";
    const episode = ins.episodes?.title ?? "";
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
  });

  const contextText = contextBlocks.join("\n\n---\n\n");

  const prompt = `You are a helpful assistant that answers questions based on podcast insights.

A user subscribes to several podcasts. Below are the most relevant insight summaries from their subscribed episodes. Answer the user's question using only this context. Be concise, specific, and cite which source(s) you draw from using [1], [2], etc. If the context doesn't adequately answer the question, say so honestly rather than guessing.

=== PODCAST INSIGHTS ===
${contextText}
=== END INSIGHTS ===

User question: ${question}

Answer:`;

  try {
    const geminiRes = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", errText);
      return NextResponse.json(
        { error: "Failed to generate answer. Please try again." },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const answer: string =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ??
      "Sorry, I couldn't generate an answer. Please try again.";

    const citations = insights.map((ins, i) => ({
      index: i + 1,
      id: ins.id,
      date: ins.date,
      domain: ins.domain,
      source_name: ins.sources?.name ?? "",
      episode_title: ins.episodes?.title ?? "",
    }));

    return NextResponse.json({ answer, citations });
  } catch (err) {
    console.error("Ask route error:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
