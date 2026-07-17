"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ListChecks, RefreshCw, Loader2, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  Workflow, StopCircle, ExternalLink, MinusCircle, ChevronDown, ChevronRight, Layers,
} from "lucide-react";

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

interface FailedEpisode {
  episodeId: string;
  sourceId: string;
  episodeTitle: string;
  sourceName: string;
  retryCount: number;
  errorMsg: string | null;
  updatedAt: string;
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

export default function TaskStatusManager() {
  const [workflows, setWorkflows] = useState<WorkflowInfo[] | null>(null);
  const [workflowsError, setWorkflowsError] = useState("");
  const [workflowsRefreshing, setWorkflowsRefreshing] = useState(false);
  const [busyWorkflow, setBusyWorkflow] = useState<string | null>(null);

  const [failedEpisodes, setFailedEpisodes] = useState<FailedEpisode[] | null>(null);
  const [failedEpisodesError, setFailedEpisodesError] = useState("");
  const [failedEpisodesRefreshing, setFailedEpisodesRefreshing] = useState(false);
  const [retryingFailedEpisodes, setRetryingFailedEpisodes] = useState(false);

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

  const loadFailedEpisodes = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setFailedEpisodesRefreshing(true);
    try {
      const res = await fetch("/api/admin/failed-episodes");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load failed episodes");
      setFailedEpisodes(data.episodes ?? []);
      setFailedEpisodesError("");
    } catch (e) {
      setFailedEpisodesError(e instanceof Error ? e.message : "Failed to load failed episodes");
    } finally {
      if (!opts.silent) setFailedEpisodesRefreshing(false);
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

  useEffect(() => { loadWorkflows(); loadFailedEpisodes(); loadExtractionChunks(); }, [loadWorkflows, loadFailedEpisodes, loadExtractionChunks]);

  // GitHub Actions has no push channel we can subscribe to from the browser
  // — poll lightly instead so in-progress runs update without a manual click.
  useEffect(() => {
    const interval = setInterval(() => loadWorkflows({ silent: true }), 20000);
    return () => clearInterval(interval);
  }, [loadWorkflows]);

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

  async function retryFailedEpisodesNow() {
    setRetryingFailedEpisodes(true);
    try {
      const res = await fetch("/api/admin/failed-episodes", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to trigger retry");
      showToast("Retry queued — GitHub Actions will start within a minute or two.", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to trigger retry", "error");
    } finally {
      setRetryingFailedEpisodes(false);
    }
  }

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

      {/* ── Failed Episodes ──────────────────────────────────────────────── */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: "var(--txt-3)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--txt-1)" }}>Failed Episodes</h2>
          </div>
          <div className="flex items-center gap-2">
            {failedEpisodes && failedEpisodes.length > 0 && (
              <button
                onClick={retryFailedEpisodesNow}
                disabled={retryingFailedEpisodes}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
                style={{ background: "var(--acc)", color: "#fff" }}
              >
                {retryingFailedEpisodes ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                Retry now
              </button>
            )}
            <button
              onClick={() => loadFailedEpisodes()}
              disabled={failedEpisodesRefreshing}
              title="Refresh failed episodes"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors disabled:opacity-60"
              style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${failedEpisodesRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: "var(--txt-3)" }}>
          Episodes still stuck after ingestion — usually every free-tier LLM provider was exhausted mid-run.
          The <strong>Retry Failed Episodes</strong> workflow above re-attempts these automatically 4×/day; "Retry now" runs it immediately.
        </p>

        {failedEpisodesError && <p className="text-sm mb-4" style={{ color: "#EF4444" }}>{failedEpisodesError}</p>}

        {!failedEpisodes && !failedEpisodesError && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-4)" }} />
          </div>
        )}

        {failedEpisodes && failedEpisodes.length === 0 && !failedEpisodesError && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--txt-4)" }}>
            No failed episodes right now.
          </p>
        )}

        {failedEpisodes && failedEpisodes.length > 0 && (
          <div className="rounded-2xl border overflow-hidden divide-y" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
            {failedEpisodes.map((ep) => (
              <div key={ep.episodeId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{ep.episodeTitle}</p>
                  <span className="text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
                    {new Date(ep.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs" style={{ color: "var(--txt-4)" }}>{ep.sourceName}</span>
                  <span className="text-xs" style={{ color: "var(--txt-4)" }}>·</span>
                  <span className="text-xs" style={{ color: "var(--txt-4)" }}>
                    {ep.retryCount} retr{ep.retryCount !== 1 ? "ies" : "y"}
                  </span>
                </div>
                {ep.errorMsg && (
                  <p className="text-xs truncate" style={{ color: "#F87171" }} title={ep.errorMsg}>{ep.errorMsg}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

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
