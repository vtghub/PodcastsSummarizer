import { NextResponse } from "next/server";
import { isAdmin, getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

type Scope = "pipeline" | "ask_ai" | "recommendations";
const SCOPES: Scope[] = ["pipeline", "ask_ai", "recommendations"];

/**
 * Three independent places this app calls an LLM, each with its own waterfall:
 *
 * "pipeline" — the worker's podcast insight extraction. Must stay in sync
 * with PROVIDER_SLOTS in worker/providers/llm/provider_registry.py, the
 * source of truth for which adapters actually exist there.
 *
 * "ask_ai" — the dashboard's own /api/ask chat waterfall (see
 * lib/llm-waterfall.ts, which reads this same config).
 *
 * "recommendations" — weekly best-of-week insight ranking. Two call sites
 * read this same scope: the worker's weekly_recommendations job (Python,
 * pre-computed, uses the pipeline-scope adapters — see
 * worker/providers/llm/waterfall_llm.py rank_insights()) and the dashboard's
 * on-demand /api/recommendations refresh (TypeScript, via lib/llm-waterfall.ts's
 * same runWaterfall() used by ask_ai — same provider set, since it's the
 * same function).
 *
 * Either way, this list is only for displaying/toggling — adding a new
 * provider TYPE is still a code change in the relevant waterfall.
 */
// runs_here: whether THIS dashboard process (Vercel/local Next.js) is ever
// the one calling this provider directly — if false, checking
// process.env[env_var] here would just check an environment this slot never
// actually runs in, so the UI shouldn't claim to know its status.
// Order matches worker/providers/llm/provider_registry.py's PROVIDER_SLOTS
// (and lib/llm-waterfall.ts's defaultOrder). Model lineup verified 2026-10-16.
const PIPELINE_SLOTS = [
  { key: "gemini", display_name: "Gemini 3.5 Flash", env_var: "GEMINI_API_KEY", runs_here: false },
  { key: "groq_gpt_oss_120b", display_name: "Groq — GPT-OSS 120B", env_var: "GROQ_API_KEY", runs_here: false },
  { key: "groq_qwen_27b", display_name: "Groq — Qwen3.8 27B", env_var: "GROQ_API_KEY", runs_here: false },
  { key: "cohere", display_name: "Cohere Command A+", env_var: "COHERE_API_KEY", runs_here: false },
  { key: "mistral", display_name: "Mistral Small", env_var: "MISTRAL_API_KEY", runs_here: false },
  { key: "mistral_ministral", display_name: "Mistral — Ministral 14B", env_var: "MISTRAL_API_KEY", runs_here: false },
  { key: "gemini_flash_lite", display_name: "Gemini 3.5 Flash-Lite", env_var: "GEMINI_API_KEY", runs_here: false },
  { key: "groq_gpt_oss_20b", display_name: "Groq — GPT-OSS 20B", env_var: "GROQ_API_KEY", runs_here: false },
  { key: "openrouter_laguna_s", display_name: "Poolside Laguna S 2.1 (OpenRouter)", env_var: "OPENROUTER_API_KEY", runs_here: false },
  { key: "openrouter_nemotron_super", display_name: "NVIDIA Nemotron 3 Super (OpenRouter)", env_var: "OPENROUTER_API_KEY", runs_here: false },
  { key: "openrouter_free", display_name: "OpenRouter Free Router", env_var: "OPENROUTER_API_KEY", runs_here: false },
  // Cerebras is trial-credit only now (one-time $5, expires after 30 days —
  // not a free tier), so it's the LAST rung. Its catalog is live-discovered
  // by the worker at waterfall-build time (provider_registry.py's
  // _discover_cerebras_slots); this one row is the fallback used when
  // discovery can't run. Any other model Cerebras adds still works
  // automatically, it just won't have a row here to toggle individually.
  { key: "cerebras_gpt_oss_120b", display_name: "GPT-OSS 120B (Cerebras trial credit)", env_var: "CEREBRAS_API_KEY", runs_here: false },
];

// ask_ai and recommendations both run through the exact same runWaterfall()
// in lib/llm-waterfall.ts (just a different scope name for config lookup),
// so they share one provider list.
const ASK_AI_SLOTS = [
  { key: "gemini", display_name: "Gemini 3.5 Flash", env_var: "GEMINI_API_KEY", runs_here: true },
  { key: "groq_gpt_oss_120b", display_name: "Groq — GPT-OSS 120B", env_var: "GROQ_API_KEY", runs_here: true },
  { key: "groq_qwen_27b", display_name: "Groq — Qwen3.8 27B", env_var: "GROQ_API_KEY", runs_here: true },
  { key: "cohere", display_name: "Cohere Command A+", env_var: "COHERE_API_KEY", runs_here: true },
  { key: "mistral", display_name: "Mistral Small", env_var: "MISTRAL_API_KEY", runs_here: true },
  { key: "mistral_ministral", display_name: "Mistral — Ministral 14B", env_var: "MISTRAL_API_KEY", runs_here: true },
  { key: "gemini_flash_lite", display_name: "Gemini 3.5 Flash-Lite", env_var: "GEMINI_API_KEY", runs_here: true },
  { key: "groq_gpt_oss_20b", display_name: "Groq — GPT-OSS 20B", env_var: "GROQ_API_KEY", runs_here: true },
  { key: "openrouter_laguna_s", display_name: "Poolside Laguna S 2.1 (OpenRouter)", env_var: "OPENROUTER_API_KEY", runs_here: true },
  { key: "openrouter_nemotron_super", display_name: "NVIDIA Nemotron 3 Super (OpenRouter)", env_var: "OPENROUTER_API_KEY", runs_here: true },
  { key: "openrouter_free", display_name: "OpenRouter Free Router", env_var: "OPENROUTER_API_KEY", runs_here: true },
  { key: "cerebras", display_name: "GPT-OSS 120B (Cerebras trial credit)", env_var: "CEREBRAS_API_KEY", runs_here: true },
];

const PROVIDER_SLOTS: Record<Scope, { key: string; display_name: string; env_var: string; runs_here: boolean }[]> = {
  pipeline: PIPELINE_SLOTS,
  ask_ai: ASK_AI_SLOTS,
  recommendations: ASK_AI_SLOTS,
};

interface ConfigRow {
  scope: Scope;
  provider_key: string;
  enabled: boolean;
  priority: number;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb.from("llm_provider_config").select("scope, provider_key, enabled, priority");
  if (error) {
    // Table may not exist yet if migration 018/019 hasn't been run — degrade
    // to defaults rather than a hard error, same as the worker side does.
    console.error("[admin/llm-providers] failed to read config:", error.message);
  }
  const configByScopeAndKey = new Map(
    (data ?? []).map((r) => [`${r.scope}:${r.provider_key}`, r as ConfigRow])
  );

  const result: Record<Scope, unknown[]> = { pipeline: [], ask_ai: [], recommendations: [] };
  for (const scope of SCOPES) {
    const providers = PROVIDER_SLOTS[scope].map((slot, index) => {
      const row = configByScopeAndKey.get(`${scope}:${slot.key}`);
      return {
        key: slot.key,
        display_name: slot.display_name,
        env_var: slot.env_var,
        runs_here: slot.runs_here,
        // Only meaningful when runs_here — this dashboard process never
        // calls the worker-only providers, so checking its own env for them
        // would be checking the wrong environment entirely.
        env_var_present_here: slot.runs_here ? Boolean(process.env[slot.env_var]) : null,
        enabled: row?.enabled ?? true,
        priority: row?.priority ?? index,
      };
    });
    providers.sort((a, b) => a.priority - b.priority);
    result[scope] = providers;
  }

  return NextResponse.json(result);
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { scope?: string; provider_key?: string; enabled?: boolean; priority?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { scope, provider_key, enabled, priority } = body;
  if (!scope || !SCOPES.includes(scope as Scope)) {
    return NextResponse.json({ error: "Unknown or missing scope" }, { status: 400 });
  }
  const slots = PROVIDER_SLOTS[scope as Scope];
  if (!provider_key || !slots.some((s) => s.key === provider_key)) {
    return NextResponse.json({ error: "Unknown provider_key for this scope" }, { status: 400 });
  }
  if (enabled === undefined && priority === undefined) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const userId = await getUserId();
  const sb = getSupabaseClient();

  // Upsert needs the full row (enabled + priority) since PATCH here may only
  // change one field — read the current values (or defaults) first.
  const { data: existing } = await sb
    .from("llm_provider_config")
    .select("enabled, priority")
    .eq("scope", scope)
    .eq("provider_key", provider_key)
    .maybeSingle() as { data: { enabled: boolean; priority: number } | null };

  const defaultIndex = slots.findIndex((s) => s.key === provider_key);
  const nextEnabled = enabled ?? existing?.enabled ?? true;
  const nextPriority = priority ?? existing?.priority ?? defaultIndex;

  const { error } = await sb.from("llm_provider_config").upsert(
    {
      scope,
      provider_key,
      enabled: nextEnabled,
      priority: nextPriority,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "scope,provider_key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ scope, provider_key, enabled: nextEnabled, priority: nextPriority });
}
