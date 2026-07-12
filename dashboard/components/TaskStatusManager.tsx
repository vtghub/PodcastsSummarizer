"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ListChecks, RefreshCw, Loader2, PlayCircle, CheckCircle2, XCircle, Clock,
  Workflow, StopCircle, ExternalLink, MinusCircle, ChevronDown, ChevronRight, Layers,
} from "lucide-react";
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

interface RunInfo {
  id: number;
  status: string;       // queued | in_progress | completed | waiting
  conclusion: string | null;
  createdAt: string;
  htmlUrl: string;
  event: string;
}

interface WorkflowInfo {
  id: number;
  name: string;
  fileName: string;
  state: string;
  htmlUrl: string;
  latestRun: RunInfo | null;
}

interface ChunkDetail {
  chunkIndex: number;
  totalChunks: number;
  phase: string;         // 'summary' | 'synthesis'
  providerName: string;
  status: string;        // 'success' | 'failed'
  errorMsg: string | null;
  createdAt: string;
}

interface EpisodeChunks {
  episodeId: string;
  sourceId: string;
  episodeTitle: string;
  sourceName: string;
  totalChunks: number;
  hasFailure: boolean;
  latestEventAt: string;
  chunks: ChunkDetail[];
}

function statusBadge(status: string) {
  if (status === "completed") return { icon: CheckCircle2, color: "#34D399", label: "Completed" };
  if (status === "failed") return { icon: XCircle, color: "#F87171", label: "Failed" };
  return { icon: Clock, color: "var(--acc)", label: "Running" };
}

function runBadge(run: RunInfo | null) {
  if (!run) return { icon: MinusCircle, color: "var(--txt-4)", label: "Never run" };
  if (run.status === "in_progress" || run.status === "queued" || run.status === "waiting") {
    return { icon: Loader2, color: "var(--acc)", label: run.status === "queued" ? "Queued" : "Running", spin: true };
  }
  if (run.conclusion === "success") return { icon: CheckCircle2, color: "#34D399", label: "Success" };
  if (run.conclusion === "failure") return { icon: XCircle, color: "#F87171", label: "Failed" };
  if (run.conclusion === "cancelled") return { icon: MinusCircle, color: "var(--txt-4)", label: "Cancelled" };
  return { icon: MinusCircle, color: "var(--txt-4)", label: run.conclusion ?? run.status };
}

const DEFAULT_BATCH_SIZE = 30; // matches backfill_insights.yml's workflow_dispatch default and migration 020's column default

export default function TaskStatusManager() {
  const [job, setJob] = useState<BackfillJob | null>(null);
  const [failures, setFailures] = useState<BackfillFailure[]>([]);
  const [currentTotalInsights, setCurrentTotalInsights] = useState<number | null>(null);
  const [loadError, setLoadError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [triggering, setTriggering] = useState(false);

  const [workflows, setWorkflows] = useState<WorkflowInfo[] | null>(null);
  const [workflowsError, setWorkflowsError] = useState("");
  const [workflowsRefreshing, setWorkflowsRefreshing] = useState(false);
  const [busyWorkflow, setBusyWorkflow] = useState<string | null>(null);

  const [extractionEpisodes, setExtractionEpisodes] = useState<EpisodeChunks[] | null>(null);
  const [extractionError, setExtractionError] = useState("");
  const [extractionRefreshing, setExtractionRefreshing] = useState(false);
  const [expandedEpisodeId, setExpandedEpisodeId] = useState<string | null>(null);

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
      setCurrentTotalInsights(data.currentTotalInsights ?? null);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load status");
    } finally {
      if (!opts.silent) setRefreshing(false);
    }
  }, []);

  const loadWorkflows = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setWorkflowsRefreshing(true);
    try {
      const res = await fetch("/api/admin/workflows");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load workflows");
      setWorkflows(data.workflows ?? []);
      setWorkflowsError("");
    } catch (e) {
      setWorkflowsError(e instanceof Error ? e.message : "Failed to load workflows");
    } finally {
      if (!opts.silent) setWorkflowsRefreshing(false);
    }
  }, []);

  const loadExtractionChunks = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setExtractionRefreshing(true);
    try {
      const res = await fetch("/api/admin/extraction-chunks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load transcription detail");
      setExtractionEpisodes(data.episodes ?? []);
      setExtractionError("");
    } catch (e) {
      setExtractionError(e instanceof Error ? e.message : "Failed to load transcription detail");
    } finally {
      if (!opts.silent) setExtractionRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); loadWorkflows(); loadExtractionChunks(); }, [load, loadWorkflows, loadExtractionChunks]);

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

  // GitHub Actions has no push channel we can subscribe to from the browser
  // — poll lightly instead so in-progress runs update without a manual click.
  useEffect(() => {
    const interval = setInterval(() => loadWorkflows({ silent: true }), 20000);
    return () => clearInterval(interval);
  }, [loadWorkflows]);

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

  async function runWorkflowNow(fileName: string) {
    setBusyWorkflow(fileName);
    try {
      const res = await fetch("/api/admin/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dispatch", fileName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger workflow");
      showToast("Run queued — refreshing shortly…", "success");
      setTimeout(() => loadWorkflows({ silent: true }), 3000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to trigger workflow", "error");
    } finally {
      setBusyWorkflow(null);
    }
  }

  async function cancelRun(fileName: string, runId: number) {
    setBusyWorkflow(fileName);
    try {
      const res = await fetch("/api/admin/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", runId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to cancel run");
      showToast("Cancel requested.", "success");
      setTimeout(() => loadWorkflows({ silent: true }), 3000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to cancel run", "error");
    } finally {
      setBusyWorkflow(null);
    }
  }

  const pct = job && job.total_items > 0 ? Math.min(100, Math.round((job.processed_items / job.total_items) * 100)) : 0;
  const badge = job ? statusBadge(job.status) : null;

  // Orchestration estimate — answers "how many batches / days will this take"
  // both before a job has ever run (using the current total) and while one
  // is in progress (using its remaining count). Assumes the daily cron as
  // the baseline cadence; clicking "Run now" or "Run batch now" adds extra
  // batches beyond that, shortening the estimate.
  const batchSize = job?.batch_size ?? DEFAULT_BATCH_SIZE;
  const activeJob = job && job.status !== "completed";
  const remainingItems = activeJob
    ? Math.max(0, job.total_items - job.processed_items)
    : currentTotalInsights;
  const remainingBatches = remainingItems !== null ? Math.ceil(remainingItems / batchSize) : null;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <ListChecks className="w-6 h-6" style={{ color: "var(--acc)" }} />
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Task Status</h1>
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--txt-3)" }}>
        Background jobs and scheduled GitHub Actions runners for this project.
      </p>

      {remainingBatches !== null && remainingItems !== null && (
        <div className="rounded-2xl border p-4 mb-6" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
          <p className="text-sm font-semibold mb-1" style={{ color: "var(--txt-1)" }}>
            Insight backfill orchestration
          </p>
          <p className="text-sm" style={{ color: "var(--txt-3)" }}>
            {activeJob ? (
              <>{remainingItems} insight{remainingItems !== 1 ? "s" : ""} left to reprocess</>
            ) : (
              <>{remainingItems} insight{remainingItems !== 1 ? "s" : ""} exist right now</>
            )}
            {" — at "}{batchSize}{" per batch, that's "}
            <strong style={{ color: "var(--txt-1)" }}>{remainingBatches} batch{remainingBatches !== 1 ? "es" : ""}</strong>.
            {" "}The daily cron runs one batch/day, so a hands-off backfill would take about{" "}
            <strong style={{ color: "var(--txt-1)" }}>{remainingBatches} day{remainingBatches !== 1 ? "s" : ""}</strong>
            {" "}(3:30 AM UTC each day) — click <strong>Run now</strong> / <strong>Run batch now</strong> to add extra batches
            and finish sooner. New episodes processed while this is running aren't counted here until a later job picks them up.
          </p>
        </div>
      )}

      {/* ── GitHub Actions Runners ─────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Workflow className="w-4 h-4" style={{ color: "var(--txt-3)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>GitHub Actions Runners</h2>
          </div>
          <button
            onClick={() => loadWorkflows()}
            disabled={workflowsRefreshing}
            title="Refresh runners"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
            style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${workflowsRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {workflowsError && <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{workflowsError}</p>}

        {!workflows && !workflowsError && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
          </div>
        )}

        {workflows && (
          <div className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
            {workflows.map((wf) => {
              const rb = runBadge(wf.latestRun);
              const isBusy = busyWorkflow === wf.fileName;
              const isActive = wf.latestRun && ["queued", "in_progress", "waiting"].includes(wf.latestRun.status);
              return (
                <div key={wf.id} className="flex items-center gap-3 px-4 py-3">
                  <rb.icon className={`w-4 h-4 flex-shrink-0 ${rb.spin ? "animate-spin" : ""}`} style={{ color: rb.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{wf.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs" style={{ color: rb.color }}>{rb.label}</span>
                      {wf.latestRun && (
                        <>
                          <span className="text-xs" style={{ color: "var(--txt-4)" }}>·</span>
                          <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                            {new Date(wf.latestRun.createdAt).toLocaleString()}
                          </span>
                          <a
                            href={wf.latestRun.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs"
                            style={{ color: "var(--txt-4)" }}
                            title="View on GitHub"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {isActive ? (
                    <button
                      onClick={() => wf.latestRun && cancelRun(wf.fileName, wf.latestRun.id)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60 flex-shrink-0"
                      style={{ background: "var(--bg-elevated)", color: "#F87171", borderColor: "var(--bdr)" }}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <StopCircle className="w-3.5 h-3.5" />}
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={() => runWorkflowNow(wf.fileName)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 flex-shrink-0"
                      style={{ background: "var(--acc)", color: "#fff" }}
                    >
                      {isBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                      Run now
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Insight backfill job ───────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>Insight Backfill</h2>
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
      <p className="text-sm mb-3" style={{ color: "var(--txt-3)" }}>
        Re-runs every existing insight through the current LLM waterfall, reusing its saved transcript.
        Runs one batch daily (or via the runner above) and resumes automatically.
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

      {/* ── Episode transcription / chunking detail ────────────────────── */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4" style={{ color: "var(--txt-3)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>Episode Transcription Detail</h2>
          </div>
          <button
            onClick={() => loadExtractionChunks()}
            disabled={extractionRefreshing}
            title="Refresh transcription detail"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
            style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${extractionRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--txt-3)" }}>
          The 15 most recently processed long episodes — how many chunks each transcript was split into,
          which LLM model handled each chunk, and whether it succeeded.
        </p>

        {extractionError && <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{extractionError}</p>}

        {!extractionEpisodes && !extractionError && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
          </div>
        )}

        {extractionEpisodes && extractionEpisodes.length === 0 && !extractionError && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--txt-4)" }}>
            No chunked extractions logged yet — this only fires for episodes whose transcript was long
            enough to require map-reduce chunking.
          </p>
        )}

        {extractionEpisodes && extractionEpisodes.length > 0 && (
          <div className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
            {extractionEpisodes.map((ep) => {
              const isExpanded = expandedEpisodeId === ep.episodeId;
              return (
                <div key={ep.episodeId}>
                  <button
                    onClick={() => setExpandedEpisodeId(isExpanded ? null : ep.episodeId)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
                    ) : (
                      <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
                    )}
                    {ep.hasFailure ? (
                      <XCircle className="w-4 h-4 flex-shrink-0" style={{ color: "#F87171" }} />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#34D399" }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{ep.episodeTitle}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>{ep.sourceName}</span>
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>·</span>
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                          {ep.totalChunks} chunk{ep.totalChunks !== 1 ? "s" : ""}
                        </span>
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>·</span>
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                          {new Date(ep.latestEventAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-3 pl-11">
                      <div className="rounded-xl border overflow-hidden divide-y" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
                        {ep.chunks.map((c, i) => (
                          <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                            {c.status === "success" ? (
                              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#34D399" }} />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#F87171" }} />
                            )}
                            <span className="text-xs font-medium flex-shrink-0" style={{ color: "var(--txt-2)", minWidth: 88 }}>
                              {c.phase === "synthesis" ? "Synthesis" : `Chunk ${c.chunkIndex}/${c.totalChunks}`}
                            </span>
                            <span className="text-xs truncate flex-1" style={{ color: "var(--txt-3)" }}>
                              {c.providerName}
                            </span>
                            <span className="text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
                              {new Date(c.createdAt).toLocaleTimeString()}
                            </span>
                            {c.errorMsg && (
                              <span className="text-xs flex-shrink-0" style={{ color: "#F87171" }} title={c.errorMsg}>
                                {c.errorMsg.length > 40 ? `${c.errorMsg.slice(0, 40)}…` : c.errorMsg}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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
