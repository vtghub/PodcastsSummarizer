"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Cpu, RefreshCw, Loader2, ChevronUp, ChevronDown, ChevronRight, CheckCircle2, XCircle, Workflow, MessageCircleQuestion, Sparkles, HelpCircle, Activity } from "lucide-react";

interface Provider {
  key: string;
  display_name: string;
  env_var: string;
  runs_here: boolean;
  env_var_present_here: boolean | null;
  enabled: boolean;
  priority: number;
}

// Mirrors ProbeResult in lib/llm-waterfall.ts (that module is server-only, so
// the shape is repeated here rather than imported into a client component).
type ProbeStatus = "ok" | "rate_limited" | "empty" | "error" | "timeout" | "no_key";
interface ProbeResult {
  provider_key: string;
  name: string;
  status: ProbeStatus;
  latency_ms: number | null;
  detail?: string;
}

const PROBE_STYLE: Record<ProbeStatus, { label: string; color: string; bg: string }> = {
  ok:           { label: "Working",      color: "#34D399",     bg: "rgba(6,95,70,0.25)" },
  rate_limited: { label: "Rate-limited", color: "#FBBF24",     bg: "rgba(120,83,9,0.25)" },
  empty:        { label: "Empty reply",  color: "#FBBF24",     bg: "rgba(120,83,9,0.25)" },
  error:        { label: "Failing",      color: "#F87171",     bg: "rgba(127,29,29,0.25)" },
  timeout:      { label: "Timed out",    color: "#F87171",     bg: "rgba(127,29,29,0.25)" },
  no_key:       { label: "No key here",  color: "var(--txt-4)", bg: "var(--bg-elevated)" },
};

// The pipeline scope's Cerebras row uses the worker's slug; the dashboard's
// own waterfall (which the probe exercises) calls the same model "cerebras".
// Every other slot key is identical across scopes.
const probeKeyFor = (providerKey: string) => (providerKey === "cerebras_gpt_oss_120b" ? "cerebras" : providerKey);

type Scope = "pipeline" | "ask_ai" | "recommendations";
type ProvidersByScope = Record<Scope, Provider[]>;

const SECTIONS: { scope: Scope; title: string; icon: typeof Workflow; description: string }[] = [
  {
    scope: "pipeline",
    title: "Pipeline Extraction",
    icon: Workflow,
    description:
      "The worker's insight-extraction waterfall — enabled providers are tried in order, top to bottom, " +
      "falling through to the next on failure or quota exhaustion. Changes take effect on the worker's " +
      "next pipeline run, not instantly.",
  },
  {
    scope: "ask_ai",
    title: "Ask AI",
    icon: MessageCircleQuestion,
    description:
      "The dashboard's Ask AI chat waterfall — enabled providers are tried in order for each question " +
      "asked on the /ask page. Changes take effect on the next question, immediately.",
  },
  {
    scope: "recommendations",
    title: "Recommendations",
    icon: Sparkles,
    description:
      "Weekly best-of-week insight ranking — used by both the Sunday recommendations email (worker, " +
      "picks up changes on its next run) and the on-demand “Refresh” button on /recommendations " +
      "(dashboard, immediate). Both call the same 12-slot waterfall as Ask AI.",
  },
];

export default function LlmProviderManager() {
  const [providersByScope, setProvidersByScope] = useState<ProvidersByScope | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<Scope, boolean>>({
    pipeline: false, ask_ai: false, recommendations: false,
  });
  function toggleCollapsed(scope: Scope) {
    setCollapsed((prev) => ({ ...prev, [scope]: !prev[scope] }));
  }

  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: "error" | "success" = "error") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/llm-providers");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load providers");
      setProvidersByScope({ pipeline: data.pipeline ?? [], ask_ai: data.ask_ai ?? [], recommendations: data.recommendations ?? [] });
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load providers");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<{ byKey: Record<string, ProbeResult>; testedAt: string } | null>(null);

  // Sends one tiny request to every slot (from this dashboard's environment)
  // and shows which are actually alive — a retired model otherwise just fails
  // silently inside the waterfall and gets skipped.
  async function runProbe() {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/llm-providers/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Provider test failed");
      const byKey: Record<string, ProbeResult> = {};
      for (const r of data.results as ProbeResult[]) byKey[r.provider_key] = r;
      setProbe({ byKey, testedAt: data.tested_at });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Provider test failed", "error");
    } finally {
      setTesting(false);
    }
  }

  // One-line summary across the (single, shared) set of tested slots.
  const probeSummary = (() => {
    if (!probe) return null;
    const all = Object.values(probe.byKey);
    const tested = all.filter((r) => r.status !== "no_key");
    const count = (s: ProbeStatus) => tested.filter((r) => r.status === s).length;
    const failing = count("error") + count("timeout") + count("empty");
    const parts = [`${count("ok")} of ${tested.length} responding`];
    if (count("rate_limited")) parts.push(`${count("rate_limited")} rate-limited`);
    if (failing) parts.push(`${failing} failing`);
    const skipped = all.length - tested.length;
    if (skipped) parts.push(`${skipped} skipped (no key here)`);
    return { text: parts.join(" · "), allGood: failing === 0 && tested.length > 0 };
  })();

  async function patch(scope: Scope, provider_key: string, body: { enabled?: boolean; priority?: number }) {
    const res = await fetch("/api/admin/llm-providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope, provider_key, ...body }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "Update failed");
    }
  }

  async function toggleEnabled(scope: Scope, p: Provider) {
    if (!providersByScope) return;
    const prev = providersByScope;
    setBusyKey(`${scope}:${p.key}`);
    const nextEnabled = !p.enabled;
    setProvidersByScope({
      ...prev,
      [scope]: prev[scope].map((x) => (x.key === p.key ? { ...x, enabled: nextEnabled } : x)),
    });
    try {
      await patch(scope, p.key, { enabled: nextEnabled });
    } catch (e) {
      setProvidersByScope(prev); // revert
      showToast(e instanceof Error ? e.message : "Failed to update", "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function move(scope: Scope, index: number, direction: -1 | 1) {
    if (!providersByScope) return;
    const list = providersByScope[scope];
    const target = index + direction;
    if (target < 0 || target >= list.length) return;

    const a = list[index];
    const b = list[target];
    const reordered = [...list];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const prev = providersByScope;
    setProvidersByScope({ ...prev, [scope]: reordered });
    setBusyKey(`${scope}:${a.key}`);
    try {
      // Swap their priority values so the new order persists.
      await Promise.all([
        patch(scope, a.key, { priority: b.priority }),
        patch(scope, b.key, { priority: a.priority }),
      ]);
      setProvidersByScope((curr) => {
        if (!curr) return curr;
        return {
          ...curr,
          [scope]: curr[scope].map((x) =>
            x.key === a.key ? { ...x, priority: b.priority } : x.key === b.key ? { ...x, priority: a.priority } : x
          ),
        };
      });
    } catch (e) {
      setProvidersByScope(prev); // revert
      showToast(e instanceof Error ? e.message : "Failed to reorder", "error");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <Cpu className="w-6 h-6" style={{ color: "var(--acc)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>LLM Providers</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runProbe}
            disabled={testing || !providersByScope}
            title="Send one tiny request to every provider and show which are actually working"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
            style={{ background: "var(--acc-bg)", color: "var(--acc)", borderColor: "var(--acc)" }}
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
            {testing ? "Testing…" : "Test providers"}
          </button>
          <button
            onClick={() => load()}
            disabled={refreshing}
            title="Refresh provider list"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
            style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--txt-3)" }}>
        This app calls an LLM in three independent places. Each has its own waterfall below — enabled
        providers are tried top to bottom, falling through to the next on failure or quota exhaustion.
      </p>

      {/* Result of the last "Test providers" run */}
      {testing && (
        <p className="text-xs mb-4" style={{ color: "var(--txt-4)" }}>
          Testing every provider in parallel — slow free models can take up to ~40s…
        </p>
      )}
      {!testing && probe && probeSummary && (
        <p className="text-xs mb-4" style={{ color: probeSummary.allGood ? "#34D399" : "#FBBF24" }}>
          {probeSummary.text}
          <span style={{ color: "var(--txt-4)" }}>
            {" "}— tested {new Date(probe.testedAt).toLocaleTimeString()} from this dashboard&apos;s environment.
            Worker (pipeline) rows share the same models, but the worker uses its own GitHub Actions keys.
          </span>
        </p>
      )}
      {!testing && !probe && (
        <p className="text-xs mb-4" style={{ color: "var(--txt-4)" }}>
          Free-tier models get retired every few months and a dead one is skipped silently — use
          “Test providers” to check which are really working. It sends one tiny request per provider
          (OpenRouter&apos;s free cap is only ~50/day, pooled across its slots).
        </p>
      )}

      {loadError && (
        <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{loadError}</p>
      )}

      {!providersByScope && !loadError && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
        </div>
      )}

      {providersByScope &&
        SECTIONS.map(({ scope, title, icon: Icon, description }) => {
          const providers = providersByScope[scope];
          const isCollapsed = collapsed[scope];
          const enabledCount = providers.filter((p) => p.enabled).length;
          return (
            <div key={scope} className="mb-8">
              <button
                type="button"
                onClick={() => toggleCollapsed(scope)}
                className="w-full flex items-center gap-2 mb-1 text-left"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
                ) : (
                  <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
                )}
                <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-3)" }} />
                <h2 className="text-base font-semibold" style={{ color: "var(--txt-1)" }}>{title}</h2>
                <span className="text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
                  {enabledCount}/{providers.length} enabled
                </span>
              </button>

              {!isCollapsed && (
                <>
                  <p className="text-xs mb-3 pl-6" style={{ color: "var(--txt-4)" }}>{description}</p>

                  <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
                    <div className="divide-y" style={{ borderColor: "var(--bdr)" }}>
                      {providers.map((p, i) => {
                    const busy = busyKey === `${scope}:${p.key}`;
                    return (
                      <div key={p.key} className="flex items-center gap-4 px-4 py-3" style={{ opacity: p.enabled ? 1 : 0.55 }}>
                        {/* Reorder arrows */}
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button
                            onClick={() => move(scope, i, -1)}
                            disabled={i === 0 || busy}
                            title="Move up (tried earlier)"
                            className="p-0.5 rounded disabled:opacity-25 disabled:cursor-not-allowed"
                            style={{ color: "var(--txt-4)" }}
                          >
                            <ChevronUp className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => move(scope, i, 1)}
                            disabled={i === providers.length - 1 || busy}
                            title="Move down (tried later)"
                            className="p-0.5 rounded disabled:opacity-25 disabled:cursor-not-allowed"
                            style={{ color: "var(--txt-4)" }}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Position badge */}
                        <span
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold"
                          style={{ background: "var(--bg-elevated)", color: "var(--txt-3)" }}
                        >
                          {i + 1}
                        </span>

                        {/* Name + key badge */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{p.display_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {!p.runs_here ? (
                              <span
                                className="flex items-center gap-1 text-xs"
                                style={{ color: "var(--txt-4)" }}
                                title={`This provider runs in the worker (GitHub Actions), not the dashboard — check ${p.env_var} in the worker's env / repo secrets, not here`}
                              >
                                <HelpCircle className="w-3 h-3" /> {p.env_var} — set in worker env
                              </span>
                            ) : p.env_var_present_here ? (
                              <span className="flex items-center gap-1 text-xs" style={{ color: "#34D399" }}>
                                <CheckCircle2 className="w-3 h-3" /> {p.env_var} detected here
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs" style={{ color: "var(--txt-4)" }}>
                                <XCircle className="w-3 h-3" /> {p.env_var} not set here
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Live health from the last "Test providers" run */}
                        {(() => {
                          const r = probe?.byKey[probeKeyFor(p.key)];
                          if (!r) return null;
                          const s = PROBE_STYLE[r.status];
                          const secs = r.latency_ms != null ? ` · ${(r.latency_ms / 1000).toFixed(1)}s` : "";
                          const tooltip =
                            (r.detail ? `${r.detail}\n\n` : "") +
                            (r.status === "no_key"
                              ? "This dashboard has no key for this provider, so it wasn't tested."
                              : scope === "pipeline"
                              ? "Tested from the dashboard's environment — the worker uses its own keys."
                              : `Model: ${r.name}`);
                          return (
                            <span
                              className="flex-shrink-0 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap"
                              style={{ color: s.color, background: s.bg }}
                              title={tooltip}
                            >
                              {s.label}{r.status === "ok" ? secs : ""}
                            </span>
                          );
                        })()}

                        {/* Enabled toggle */}
                        <button
                          type="button"
                          onClick={() => toggleEnabled(scope, p)}
                          disabled={busy}
                          className="relative flex-shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60"
                          style={{ background: p.enabled ? "var(--acc)" : "var(--bdr-hov)" }}
                          aria-pressed={p.enabled}
                          title={p.enabled ? "Disable this provider" : "Enable this provider"}
                        >
                          <span
                            className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform"
                            style={{ left: p.enabled ? "calc(100% - 1.25rem)" : "0.25rem" }}
                          />
                        </button>
                      </div>
                    );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg border"
          style={{
            background: toast.type === "error" ? "rgba(127,29,29,0.95)" : "rgba(6,78,59,0.95)",
            borderColor: toast.type === "error" ? "rgba(185,28,28,0.6)" : "rgba(6,95,70,0.6)",
            color: "#fff",
          }}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
