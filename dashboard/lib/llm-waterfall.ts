import { getSupabaseClient } from "@/lib/supabase";

export type LLMResult = { text: string; quotaExceeded?: boolean };

export async function callGemini(apiKey: string, prompt: string): Promise<LLMResult> {
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

export async function callGroqModel(apiKey: string, model: string, prompt: string): Promise<LLMResult> {
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

export async function callMistral(apiKey: string, prompt: string): Promise<LLMResult> {
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

export async function callTogether(apiKey: string, prompt: string): Promise<LLMResult> {
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

export async function callCerebras(apiKey: string, prompt: string): Promise<LLMResult> {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.3-70b",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 512,
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
      max_tokens: 512,
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

export async function callCohere(apiKey: string, prompt: string): Promise<LLMResult> {
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

// OpenRouter's free (":free"-suffixed) catalog — kept in sync with the same
// models declared in worker/providers/llm/provider_registry.py's
// _OPENROUTER_MODELS. If one stops existing or stops being free, its calls
// just fail and the waterfall skips past it same as any other dead provider.
const OPENROUTER_MODELS: { key: string; name: string; model: string }[] = [
  { key: "openrouter_nemotron_ultra", name: "openrouter/nemotron-3-ultra", model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  { key: "openrouter_nemotron_nano",  name: "openrouter/nemotron-3-nano",  model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" },
  { key: "openrouter_laguna_m",       name: "openrouter/laguna-m.1",       model: "poolside/laguna-m.1:free" },
  { key: "openrouter_hy3",            name: "openrouter/hy3",              model: "tencent/hy3:free" },
];

/**
 * Runs `prompt` through the 11 JS-callable providers (Gemini, Groq 8B/70B,
 * Mistral, Together, Cohere, Cerebras, 4× OpenRouter free models), in the
 * order/enabled-state configured for `scope` in llm_provider_config (falling
 * back to this default order if unconfigured), stopping at the first
 * non-quota-exceeded success.
 */
export async function runWaterfall(scope: string, prompt: string): Promise<{ text: string; model: string }> {
  const geminiKey  = process.env.GEMINI_API_KEY ?? "";
  const groqKey    = process.env.GROQ_API_KEY ?? "";
  const mistralKey = process.env.MISTRAL_API_KEY ?? "";
  const togetherKey = process.env.TOGETHER_API_KEY ?? "";
  const cohereKey  = process.env.COHERE_API_KEY ?? "";
  const cerebrasKey = process.env.CEREBRAS_API_KEY ?? "";
  const openrouterKey = process.env.OPENROUTER_API_KEY ?? "";

  const defaultOrder: WaterfallStep[] = [
    { provider_key: "gemini",   name: "gemini-2.0-flash",          hasKey: !!geminiKey,   fn: () => callGemini(geminiKey, prompt) },
    { provider_key: "groq_8b",  name: "groq/llama-3.1-8b-instant", hasKey: !!groqKey,     fn: () => callGroqModel(groqKey, "llama-3.1-8b-instant", prompt) },
    { provider_key: "groq_70b", name: "groq/llama-3.3-70b",        hasKey: !!groqKey,     fn: () => callGroqModel(groqKey, "llama-3.3-70b-versatile", prompt) },
    { provider_key: "mistral",  name: "mistral-small",             hasKey: !!mistralKey,  fn: () => callMistral(mistralKey, prompt) },
    { provider_key: "together", name: "together/llama-3.1-8b",     hasKey: !!togetherKey, fn: () => callTogether(togetherKey, prompt) },
    { provider_key: "cohere",   name: "cohere/command-r",          hasKey: !!cohereKey,   fn: () => callCohere(cohereKey, prompt) },
    { provider_key: "cerebras", name: "cerebras/llama-3.3-70b",    hasKey: !!cerebrasKey, fn: () => callCerebras(cerebrasKey, prompt) },
    ...OPENROUTER_MODELS.map((m) => ({
      provider_key: m.key,
      name: m.name,
      hasKey: !!openrouterKey,
      fn: () => callOpenRouterModel(openrouterKey, m.model, prompt),
    })),
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
