import { NextResponse } from "next/server";
import { isAdmin, getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

type Scope = "pipeline" | "ask_ai";
const SCOPES: Scope[] = ["pipeline", "ask_ai"];

/**
 * Two independent places this app calls an LLM, each with its own waterfall:
 *
 * "pipeline" — the worker's podcast insight extraction. Must stay in sync
 * with PROVIDER_SLOTS in worker/providers/llm/provider_registry.py, the
 * source of truth for which adapters actually exist there.
 *
 * "ask_ai" — the dashboard's own /api/ask chat waterfall (see
 * generateAnswer() in app/api/ask/route.ts, which reads this same config).
 *
 * Either way, this list is only for displaying/toggling — adding a new
 * provider TYPE is still a code change in the relevant waterfall.
 */
const PROVIDER_SLOTS: Record<Scope, { key: string; display_name: string; env_var: string }[]> = {
  pipeline: [
    { key: "gemini", display_name: "Gemini 2.0 Flash", env_var: "GEMINI_API_KEY" },
    { key: "groq_8b", display_name: "Groq — Llama 3.1 8B", env_var: "GROQ_API_KEY" },
    { key: "groq_70b", display_name: "Groq — Llama 3.3 70B", env_var: "GROQ_API_KEY" },
    { key: "mistral", display_name: "Mistral Small", env_var: "MISTRAL_API_KEY" },
    { key: "cohere", display_name: "Cohere Command R", env_var: "COHERE_API_KEY" },
    { key: "openrouter_nemotron_ultra", display_name: "NVIDIA Nemotron 3 Ultra (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
    { key: "openrouter_nemotron_nano", display_name: "NVIDIA Nemotron 3 Nano (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
    { key: "openrouter_laguna_m", display_name: "Poolside Laguna M.1 (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
    { key: "openrouter_hy3", display_name: "Tencent Hy3 (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
  ],
  ask_ai: [
    { key: "gemini", display_name: "Gemini 2.0 Flash", env_var: "GEMINI_API_KEY" },
    { key: "groq_8b", display_name: "Groq — Llama 3.1 8B", env_var: "GROQ_API_KEY" },
    { key: "groq_70b", display_name: "Groq — Llama 3.3 70B", env_var: "GROQ_API_KEY" },
    { key: "mistral", display_name: "Mistral Small", env_var: "MISTRAL_API_KEY" },
    { key: "together", display_name: "Together — Llama 3.1 8B", env_var: "TOGETHER_API_KEY" },
    { key: "cohere", display_name: "Cohere Command R", env_var: "COHERE_API_KEY" },
  ],
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

  const result: Record<Scope, unknown[]> = { pipeline: [], ask_ai: [] };
  for (const scope of SCOPES) {
    const providers = PROVIDER_SLOTS[scope].map((slot, index) => {
      const row = configByScopeAndKey.get(`${scope}:${slot.key}`);
      return {
        key: slot.key,
        display_name: slot.display_name,
        env_var: slot.env_var,
        // Best-effort — reflects the DASHBOARD's own environment (Vercel).
        // Authoritative for ask_ai (which runs on Vercel); only a hint for
        // pipeline (which actually runs on the worker/GitHub Actions).
        env_var_present_here: Boolean(process.env[slot.env_var]),
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
