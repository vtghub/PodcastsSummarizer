import { NextResponse } from "next/server";
import { isAdmin, getUserId } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

/**
 * Must stay in sync with PROVIDER_SLOTS in
 * worker/providers/llm/provider_registry.py — that's the source of truth
 * for which provider adapters actually exist (adding a new one is a code
 * change there); this list is just for displaying/toggling them here.
 */
const PROVIDER_SLOTS = [
  { key: "gemini", display_name: "Gemini 2.0 Flash", env_var: "GEMINI_API_KEY" },
  { key: "groq_8b", display_name: "Groq — Llama 3.1 8B", env_var: "GROQ_API_KEY" },
  { key: "groq_70b", display_name: "Groq — Llama 3.3 70B", env_var: "GROQ_API_KEY" },
  { key: "mistral", display_name: "Mistral Small", env_var: "MISTRAL_API_KEY" },
  { key: "cohere", display_name: "Cohere Command R", env_var: "COHERE_API_KEY" },
  { key: "openrouter_nemotron_ultra", display_name: "NVIDIA Nemotron 3 Ultra (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
  { key: "openrouter_nemotron_nano", display_name: "NVIDIA Nemotron 3 Nano (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
  { key: "openrouter_laguna_m", display_name: "Poolside Laguna M.1 (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
  { key: "openrouter_hy3", display_name: "Tencent Hy3 (OpenRouter)", env_var: "OPENROUTER_API_KEY" },
] as const;

interface ConfigRow {
  provider_key: string;
  enabled: boolean;
  priority: number;
}

export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();
  const { data, error } = await sb.from("llm_provider_config").select("provider_key, enabled, priority");
  if (error) {
    // Table may not exist yet if migration 018 hasn't been run — degrade to
    // defaults rather than a hard error, same as the worker side does.
    console.error("[admin/llm-providers] failed to read config:", error.message);
  }
  const configByKey = new Map((data ?? []).map((r: ConfigRow) => [r.provider_key, r]));

  const providers = PROVIDER_SLOTS.map((slot, index) => {
    const row = configByKey.get(slot.key);
    return {
      key: slot.key,
      display_name: slot.display_name,
      env_var: slot.env_var,
      // Best-effort — reflects the DASHBOARD's own environment (Vercel),
      // not necessarily the worker's (GitHub Actions secrets). Shown as a
      // hint in the UI, not an authoritative check.
      env_var_present_here: Boolean(process.env[slot.env_var]),
      enabled: row?.enabled ?? true,
      priority: row?.priority ?? index,
    };
  });

  providers.sort((a, b) => a.priority - b.priority);

  return NextResponse.json({ providers });
}

export async function PATCH(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { provider_key?: string; enabled?: boolean; priority?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { provider_key, enabled, priority } = body;
  if (!provider_key || !PROVIDER_SLOTS.some((s) => s.key === provider_key)) {
    return NextResponse.json({ error: "Unknown provider_key" }, { status: 400 });
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
    .eq("provider_key", provider_key)
    .maybeSingle() as { data: { enabled: boolean; priority: number } | null };

  const defaultIndex = PROVIDER_SLOTS.findIndex((s) => s.key === provider_key);
  const nextEnabled = enabled ?? existing?.enabled ?? true;
  const nextPriority = priority ?? existing?.priority ?? defaultIndex;

  const { error } = await sb.from("llm_provider_config").upsert(
    {
      provider_key,
      enabled: nextEnabled,
      priority: nextPriority,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "provider_key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ provider_key, enabled: nextEnabled, priority: nextPriority });
}
