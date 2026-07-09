import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

// ── LLM provider helpers ──────────────────────────────────────────────────────

type LLMResult = { text: string; quotaExceeded?: boolean };

async function callGemini(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
      }),
    }
  );
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("RESOURCE_EXHAUSTED") || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Gemini ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "" };
}

async function callGroqModel(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("rate_limit") || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Groq (${model}) ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

async function callMistral(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Mistral ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

async function callTogether(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.together.xyz/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Together ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

async function callCohere(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "command-r",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Cohere ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.message?.content?.[0]?.text ?? "" };
}

// ── Waterfall ─────────────────────────────────────────────────────────────────

async function generateAnswer(prompt: string): Promise<{ text: string; model: string }> {
  const geminiKey  = process.env.GEMINI_API_KEY ?? "";
  const groqKey    = process.env.GROQ_API_KEY ?? "";
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const togetherKey = process.env.TOGETHER_API_KEY ?? "";
  const cohereKey  = process.env.COHERE_API_KEY ?? "";

  const steps: Array<{ name: string; fn: () => Promise<LLMResult> }> = [
    { name: "gemini-2.0-flash",           fn: () => callGemini(geminiKey, prompt) },
    { name: "groq/llama-3.1-8b-instant",  fn: () => callGroqModel(groqKey, "llama-3.1-8b-instant", prompt) },
    { name: "groq/llama-3.3-70b",         fn: () => callGroqModel(groqKey, "llama-3.3-70b-versatile", prompt) },
    { name: "mistral-small",              fn: () => callMistral(mistralKey, prompt) },
    { name: "together/llama-3.1-8b",      fn: () => callTogether(togetherKey, prompt) },
    { name: "cohere/command-r",           fn: () => callCohere(cohereKey, prompt) },
  ].filter(({ name }) => {
    // Skip steps whose key is missing
    if (name.startsWith("gemini") && !geminiKey) return false;
    if (name.startsWith("groq") && !groqKey) return false;
    if (name.startsWith("mistral") && !mistralKey) return false;
    if (name.startsWith("together") && !togetherKey) return false;
    if (name.startsWith("cohere") && !cohereKey) return false;
    return true;
  });

  for (const step of steps) {
    try {
      const result = await step.fn();
      if (result.quotaExceeded) {
        console.log(`[ask] ${step.name} quota exceeded — trying next`);
        continue;
      }
      if (result.text) {
        console.log(`[ask] answered by ${step.name}`);
        return { text: result.text, model: step.name };
      }
    } catch (err) {
      console.error(`[ask] ${step.name} error:`, err);
      // continue to next provider
    }
  }

  throw new Error("All LLM providers exhausted");
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
  episodes: { title: string } | null;
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
    "id, date, domain, summary, key_points, key_quotes, action_items, sources!inner(name), episodes(title)";

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
    })
    .join("\n\n---\n\n");

  const prompt = `You are a helpful assistant that answers questions based on podcast insights.

A user subscribes to several podcasts. Below are the most relevant insight summaries from their subscribed episodes. Answer the user's question using only this context. Be concise, specific, and cite which source(s) you draw from using [1], [2], etc. If the context doesn't adequately answer the question, say so honestly rather than guessing.

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
      episode_title: ins.episodes?.title ?? "",
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
