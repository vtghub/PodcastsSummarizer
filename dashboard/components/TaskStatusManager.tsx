"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ListChecks, RefreshCw, Loader2, PlayCircle, CheckCircle2, XCircle, Clock } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

interface BackfillJob {
  id: string;
  job_type: string;
  status: string;
  total_items: number;
  processed_items: number;
  succeeded_items: number;
  failed_items: number;
  batch_size: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  last_error: string | null;
}

interface BackfillFailure {
  id: number;
  insight_id: string;
  episode_id: string;
  error_msg: string | null;
  failed_at: string;
}

function statusBadge(status: string) {
  if (status === "completed") return { icon: CheckCircle2, color: "#34D399", label: "Completed" };
  if (status === "failed") return { icon: XCircle, color: "#F87171", label: "Failed" };
  return { icon: Clock, color: "var(--acc)", label: "Running" };
}

export default function TaskStatusManager() {
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [failures, setFailures] = useState<BackfillFailure[]>([]);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "error" | "success" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string, type: "error" | "success" = "error") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setRefreshing(true);
    try {
      const res = await fetch("/api/admin/backfill");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load status");
      setJob(data.job ?? null);
      setFailures(data.failures ?? []);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      if (!opts.silent) setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Push-based refresh while a batch is running — requires migration 020
  // (backfill_jobs added to the supabase_realtime publication).
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("admin-backfill")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "backfill_jobs" },
        () => load({ silent: true })
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "backfill_jobs" },
        () => load({ silent: true })
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runBatchNow() {
    setTriggering(true);
    try {
      const res = await fetch("/api/admin/backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger batch");
      showToast("Batch queued — GitHub Actions will start it within a minute or two.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to trigger batch", "error");
    } finally {
      setTriggering(false);
    }
  }

  const pct = job && job.total_items > 0 ? Math.min(100, Math.round((job.processed_items / job.total_items) * 100)) : 0;
  const badge = job ? statusBadge(job.status) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6" style={{ color: "var(--acc)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Task Status</h1>
        </div>
        <button
          onClick={() => load()}
          disabled={refreshing}
          title="Refresh status"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
          style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--txt-3)" }}>
        Background job that re-runs every existing insight through the current LLM waterfall, reusing its
        saved transcript. Runs one batch daily (or on demand below) and resumes automatically — a full
        backfill is expected to span several days.
      </p>

      {loadError && <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{loadError}</p>}

      {!job && !loadError && !refreshing && (
        <p className="text-sm py-8 text-center" style={{ color: "var(--txt-4)" }}>
          No backfill job has run yet.
        </p>
      )}

      {refreshing && !job && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
        </div>
      )}

      {job && badge && (
        <div className="rounded-2xl border p-5 mb-6" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <badge.icon className="w-4 h-4" style={{ color: badge.color }} />
              <span className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>{badge.label}</span>
            </div>
            <span className="text-xs" style={{ color: "var(--txt-4)" }}>
              {job.processed_items} / {job.total_items} processed
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full overflow-hidden mb-4" style={{ background: "var(--bg-elevated)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${pct}%`, background: job.status === "completed" ? "#34D399" : "var(--acc)" }}
            />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-lg font-bold" style={{ color: "#34D399" }}>{job.succeeded_items}</p>
              <p className="text-xs" style={{ color: "var(--txt-4)" }}>Succeeded</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: job.failed_items > 0 ? "#F87171" : "var(--txt-3)" }}>{job.failed_items}</p>
              <p className="text-xs" style={{ color: "var(--txt-4)" }}>Failed</p>
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: "var(--txt-3)" }}>
                {Math.max(0, job.total_items - job.processed_items)}
              </p>
              <p className="text-xs" style={{ color: "var(--txt-4)" }}>Remaining</p>
            </div>
          </div>

          <p className="text-xs mb-4" style={{ color: "var(--txt-4)" }}>
            Started {new Date(job.started_at).toLocaleString()} · Last update {new Date(job.updated_at).toLocaleString()}
            {job.batch_size ? ` · ${job.batch_size} per batch` : ""}
          </p>

          {job.status !== "completed" && (
            <button
              onClick={runBatchNow}
              disabled={triggering}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
              style={{ background: "var(--acc)", color: "#fff" }}
            >
              {triggering ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
              Run batch now
            </button>
          )}
        </div>
      )}

      {failures.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--txt-1)" }}>Recent failures</h2>
          <div className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
            {failures.map((f) => (
              <div key={f.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono truncate" style={{ color: "var(--txt-3)" }}>{f.insight_id}</span>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
                    {new Date(f.failed_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "#F87171" }}>{f.error_msg ?? "Unknown error"}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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
