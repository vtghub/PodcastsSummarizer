import { getSupabaseClient } from "@/lib/supabase";

export type LLMResult = { text: string; quotaExceeded?: boolean };

// Output-token cap per call. Several models on the free ladder (Gemini 3.x,
// Groq's gpt-oss/Qwen, Nemotron) are "thinking" models whose hidden reasoning
// counts against this budget — at the old 512, gemini-3.5-flash and nemotron
// hit the cap mid-thought and returned truncated/empty text (verified live
// 2026-10-16), silently failing the rung. This is only a ceiling, not a
// target: answers stay as short as the prompt asks for.
const MAX_OUTPUT_TOKENS = 2048;

// Model ids below were verified against each provider's live catalog and a
// real request on 2026-10-16. Free-tier lineups churn every few months
// (Gemini 2.0/2.5, Groq's Llama 3.x and Cohere's `command-r` alias were all
// retired within a year of being added here); a retired model just errors
// inside the waterfall and is skipped, so re-verify periodically. Keep in
// sync with worker/providers/llm/provider_registry.py.

export async function callGemini(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.3 },
      }),
    }
  );
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("RESOURCE_EXHAUSTED") || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Gemini (${model}) ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  // Thinking models can return thought parts alongside the answer — keep only the answer.
  const parts: { text?: string; thought?: boolean }[] = data?.candidates?.[0]?.content?.parts ?? [];
  return { text: parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("") };
}

export async function callGroqModel(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
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

export async function callMistral(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Mistral (${model}) ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

// Cerebras is no longer a free tier — since July 2026 it's a one-time $5 promo
// credit (card required, expires after 30 days, never auto-bills; calls simply
// fail once it's spent). It stays as the LAST rung of the ladder so trial
// credit is only used after every genuinely-free provider is exhausted. The
// Python worker live-discovers Cerebras's catalog (provider_registry.py's
// _discover_cerebras_slots); doing that on every /api/ask request would add
// real latency, so this stays one fixed model. gpt-oss-120b is its
// "Production" tier — if Cerebras retires it, update this string.
export async function callCerebras(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("rate") || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Cerebras ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

export async function callOpenRouterModel(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.toLowerCase().includes("rate") || body.toLowerCase().includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`OpenRouter (${model}) ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  return { text: data?.choices?.[0]?.message?.content ?? "" };
}

export async function callCohere(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.3,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 429 || body.includes("quota")) {
      return { text: "", quotaExceeded: true };
    }
    throw new Error(`Cohere (${model}) ${res.status}: ${body}`);
  }
  const data = JSON.parse(body);
  // Newer Cohere models (e.g. command-a-plus) return a "thinking" block BEFORE
  // the "text" block, so content[0] isn't the answer — join just the text blocks.
  const blocks: { type?: string; text?: string }[] = data?.message?.content ?? [];
  return { text: blocks.filter((b) => (b.type ?? "text") === "text").map((b) => b.text ?? "").join("") };
}

// ── Waterfall ─────────────────────────────────────────────────────────────────

// provider_key values must match the relevant scope's slots in
// app/api/admin/llm-providers/route.ts, so the admin page's toggle/reorder
// controls actually take effect here.
interface WaterfallStep {
  provider_key: string;
  name: string;
  hasKey: boolean;
  fn: () => Promise<LLMResult>;
}

async function loadScopeConfig(scope: string): Promise<Map<string, { enabled: boolean; priority: number }>> {
  try {
    const sb = getSupabaseClient();
    const { data, error } = await sb
      .from("llm_provider_config")
      .select("provider_key, enabled, priority")
      .eq("scope", scope);
    if (error || !data) return new Map();
    return new Map(data.map((r: { provider_key: string; enabled: boolean; priority: number }) => [r.provider_key, r]));
  } catch {
    return new Map();
  }
}

// OpenRouter's free (":free"-suffixed) catalog — kept in sync with
// worker/providers/llm/provider_registry.py's _OPENROUTER_MODELS. Every model
// here must be ":free" (or the free router): tencent/hy3:free was withdrawn
// and now redirects to its PAID slug, which would bill credits. The free-model
// daily cap (50/day, 1,000 with $10 of purchased credit) looks pooled across
// all :free models, so these slots add availability, not extra quota.
const OPENROUTER_MODELS: { key: string; name: string; model: string }[] = [
  { key: "openrouter_laguna_s",       name: "openrouter/laguna-s-2.1",       model: "poolside/laguna-s-2.1:free" },
  { key: "openrouter_nemotron_super", name: "openrouter/nemotron-3-super",   model: "nvidia/nemotron-3-super-120b-a12b:free" },
  { key: "openrouter_free",           name: "openrouter/free-router",        model: "openrouter/free" },
];

/**
 * Runs `prompt` through the 12 JS-callable providers (Gemini 3.5 Flash/Flash-Lite,
 * Groq GPT-OSS 120B/20B + Qwen3.8 27B, Cohere Command A+, Mistral Small/Ministral,
 * 3 OpenRouter free slots, and Cerebras trial credit last), in the
 * order/enabled-state configured for `scope` in llm_provider_config (falling
 * back to this default order if unconfigured), stopping at the first
 * non-quota-exceeded success.
 */
export async function runWaterfall(scope: string, prompt: string): Promise<{ text: string; model: string }> {
  const geminiKey  = process.env.GEMINI_API_KEY ?? "";
  const groqKey    = process.env.GROQ_API_KEY ?? "";
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const cohereKey  = process.env.COHERE_API_KEY ?? "";
  const cerebrasKey = process.env.CEREBRAS_API_KEY ?? "";
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? "";

  // Same order as the worker's PROVIDER_SLOTS (provider_registry.py).
  const defaultOrder: WaterfallStep[] = [
    { provider_key: "gemini",            name: "gemini-3.5-flash",           hasKey: !!geminiKey,  fn: () => callGemini(geminiKey, "gemini-3.5-flash", prompt) },
    { provider_key: "groq_gpt_oss_120b", name: "groq/gpt-oss-120b",          hasKey: !!groqKey,    fn: () => callGroqModel(groqKey, "openai/gpt-oss-120b", prompt) },
    { provider_key: "groq_qwen_27b",     name: "groq/qwen3.8-27b",           hasKey: !!groqKey,    fn: () => callGroqModel(groqKey, "qwen/qwen3.8-27b", prompt) },
    { provider_key: "cohere",            name: "cohere/command-a-plus",      hasKey: !!cohereKey,  fn: () => callCohere(cohereKey, "command-a-plus-05-2026", prompt) },
    { provider_key: "mistral",           name: "mistral-small",              hasKey: !!mistralKey, fn: () => callMistral(mistralKey, "mistral-small-latest", prompt) },
    { provider_key: "mistral_ministral", name: "mistral/ministral-14b",      hasKey: !!mistralKey, fn: () => callMistral(mistralKey, "ministral-14b-latest", prompt) },
    { provider_key: "gemini_flash_lite", name: "gemini-3.5-flash-lite",      hasKey: !!geminiKey,  fn: () => callGemini(geminiKey, "gemini-3.5-flash-lite", prompt) },
    { provider_key: "groq_gpt_oss_20b",  name: "groq/gpt-oss-20b",           hasKey: !!groqKey,    fn: () => callGroqModel(groqKey, "openai/gpt-oss-20b", prompt) },
    ...OPENROUTER_MODELS.map((m) => ({
      provider_key: m.key,
      name: m.name,
      hasKey: !!openrouterKey,
      fn: () => callOpenRouterModel(openrouterKey, m.model, prompt),
    })),
    { provider_key: "cerebras",          name: "cerebras/gpt-oss-120b",      hasKey: !!cerebrasKey, fn: () => callCerebras(cerebrasKey, prompt) },
  ];

  const config = await loadScopeConfig(scope);

  const steps = defaultOrder
    .filter((s) => s.hasKey)
    .filter((s) => (config.get(s.provider_key)?.enabled ?? true))
    .sort((a, b) => {
      const pa = config.get(a.provider_key)?.priority;
      const pb = config.get(b.provider_key)?.priority;
      const defaultA = defaultOrder.indexOf(a);
      const defaultB = defaultOrder.indexOf(b);
      return (pa ?? defaultA) - (pb ?? defaultB);
    });

  for (const step of steps) {
    try {
      const result = await step.fn();
      if (result.quotaExceeded) {
        console.log(`[llm-waterfall:${scope}] ${step.name} quota exceeded — trying next`);
        continue;
      }
      if (result.text) {
        console.log(`[llm-waterfall:${scope}] answered by ${step.name}`);
        return { text: result.text, model: step.name };
      }
    } catch (err) {
      console.error(`[llm-waterfall:${scope}] ${step.name} error:`, err);
      // continue to next provider
    }
  }

  throw new Error("All LLM providers exhausted");
}
