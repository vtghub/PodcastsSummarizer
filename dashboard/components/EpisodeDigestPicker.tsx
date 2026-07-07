"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Send, CheckCircle, AlertCircle, Zap, Clock } from "lucide-react";
import type { Source, EpisodeItem } from "@/lib/db";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type ButtonState = "idle" | "loading-episodes" | "sending" | "processing" | "sent" | "queued" | "error";
type EpisodeStatus = "processed" | "queued" | "unprocessed";

const STORAGE_KEY = "podcast_queued_episodes";
const QUEUE_TTL_MS = 20 * 60 * 1000; // 20 minutes

function readQueuedIds(): Set<string> {
  try {
    const entries: { id: string; queuedAt: number }[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const now = Date.now();
    return new Set(entries.filter((e) => now - e.queuedAt < QUEUE_TTL_MS).map((e) => e.id));
  } catch {
    return new Set();
  }
}

function persistQueuedId(episodeId: string) {
  try {
    const entries: { id: string; queuedAt: number }[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    const now = Date.now();
    const fresh = entries.filter((e) => now - e.queuedAt < QUEUE_TTL_MS && e.id !== episodeId);
    fresh.push({ id: episodeId, queuedAt: now });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {}
}

function removeQueuedId(episodeId: string) {
  try {
    const entries: { id: string; queuedAt: number }[] = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.filter((e) => e.id !== episodeId)));
  } catch {}
}

interface Props {
  subscribedSources: Source[];
}

export default function EpisodeDigestPicker({ subscribedSources }: Props) {
  const [sourceId, setSourceId]     = useState("");
  const [episodes, setEpisodes]     = useState<EpisodeItem[]>([]);
  const [episodeId, setEpisodeId]   = useState("");
  const [state, setState]           = useState<ButtonState>("idle");
  const [message, setMessage]       = useState("");
  const [queuedIds, setQueuedIds]   = useState<Set<string>>(new Set());

  // Tracks which episode ID should be auto-sent once processing completes.
  // Using a ref avoids stale-closure issues inside the Realtime useEffect.
  const pendingSendRef = useRef<string | null>(null);

  // Load queued IDs from localStorage on mount
  useEffect(() => { setQueuedIds(readQueuedIds()); }, []);

  // Core send logic — shared by manual send and auto-send after processing
  const sendDigestForEpisode = useCallback(async (epId: string) => {
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/digest/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: epId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Failed to send digest");
      } else {
        setState("sent");
        setMessage(`Digest sent — ${data.count} insight${data.count !== 1 ? "s" : ""} from ${data.date}`);
        setTimeout(() => { setState("idle"); setMessage(""); }, 8000);
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
  }, []);

  // Subscribe to Supabase Realtime for queued episodes.
  // Watches two tables:
  //   - insights INSERT  → pipeline succeeded, mark episode processed + auto-send if pending
  //   - episode_queue INSERT/UPDATE → done or failed status
  useEffect(() => {
    const visibleQueued = episodes
      .filter((ep) => queuedIds.has(ep.id) && !ep.processed)
      .map((ep) => ep.id);
    if (visibleQueued.length === 0) return;

    function markDone(epId: string) {
      setEpisodes((prev) =>
        prev.map((ep) => ep.id === epId ? { ...ep, processed: true } : ep)
      );
      setQueuedIds((prev) => { const next = new Set(prev); next.delete(epId); return next; });
      removeQueuedId(epId);

      // Auto-send if user originally clicked "Process & Send Digest" for this episode
      if (pendingSendRef.current === epId) {
        pendingSendRef.current = null;
        sendDigestForEpisode(epId);
      }
    }

    function markFailed(epId: string, errMsg?: string) {
      setEpisodes((prev) =>
        prev.map((ep) => ep.id === epId ? { ...ep, processed: false } : ep)
      );
      setQueuedIds((prev) => { const next = new Set(prev); next.delete(epId); return next; });
      removeQueuedId(epId);
      pendingSendRef.current = null;
      setMessage(errMsg ?? "Processing failed — you can try again.");
      setState("error");
    }

    const supabase = getSupabaseBrowserClient();
    const channel = supabase
      .channel("queued-episode-updates")
      // insights INSERT → success
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "insights" },
        (payload) => {
          const epId = payload.new?.episode_id as string | undefined;
          if (!epId || !visibleQueued.includes(epId)) return;
          markDone(epId);
        }
      )
      // episode_queue INSERT or UPDATE → done or failed
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "episode_queue" },
        (payload) => {
          const row = payload.new as { episode_id?: string; status?: string; error_msg?: string } | undefined;
          if (!row?.episode_id || !visibleQueued.includes(row.episode_id)) return;
          if (row.status === "done") markDone(row.episode_id);
          else if (row.status === "failed") markFailed(row.episode_id, row.error_msg ?? undefined);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queuedIds, episodes, sendDigestForEpisode]);

  const selectedEpisode = episodes.find((e) => e.id === episodeId);

  function epStatus(ep: EpisodeItem): EpisodeStatus {
    if (ep.processed) return "processed";
    if (queuedIds.has(ep.id)) return "queued";
    return "unprocessed";
  }

  const selectedStatus: EpisodeStatus = selectedEpisode ? epStatus(selectedEpisode) : "unprocessed";

  const loadEpisodes = useCallback(async (sid: string) => {
    if (!sid) { setEpisodes([]); setEpisodeId(""); return; }
    setState("loading-episodes");
    setEpisodes([]);
    setEpisodeId("");
    setMessage("");
    try {
      const res = await fetch(`/api/digest/episodes?sourceId=${encodeURIComponent(sid)}&includeAll=true`);
      const data: EpisodeItem[] = await res.json();
      setEpisodes(data);
    } catch {
      setMessage("Failed to load episodes");
    } finally {
      setState("idle");
    }
  }, []);

  useEffect(() => { loadEpisodes(sourceId); }, [sourceId, loadEpisodes]);

  async function handleSend() {
    if (!selectedEpisode) return;
    await sendDigestForEpisode(selectedEpisode.id);
  }

  async function handleProcess() {
    if (!selectedEpisode) return;
    setState("processing");
    setMessage("");
    try {
      const res = await fetch("/api/digest/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId,
          audioUrl: selectedEpisode.audioUrl,
          episodeId: selectedEpisode.id,
          episodeTitle: selectedEpisode.title,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Failed to queue processing");
        return;
      }
      // Mark this episode for auto-send when processing completes
      pendingSendRef.current = selectedEpisode.id;

      persistQueuedId(selectedEpisode.id);
      setQueuedIds(readQueuedIds());

      setState("queued");
      setMessage("");
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
  }

  const busy = state === "sending" || state === "processing" || state === "loading-episodes";

  function epLabel(ep: EpisodeItem): string {
    const status = epStatus(ep);
    const prefix = status === "processed" ? "✓ " : status === "queued" ? "⏳ " : "○ ";
    const date = ep.publishedAt ? ` (${formatDate(ep.publishedAt)})` : "";
    return `${prefix}${ep.title}${date}`;
  }

  // Is the currently-selected episode the one pending auto-send?
  const isAutoSendPending = selectedEpisode && pendingSendRef.current === selectedEpisode.id;

  return (
    <div className="space-y-3">
      {/* Podcast selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Podcast</label>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
          className="input"
          disabled={busy}
        >
          <option value="">— choose a podcast —</option>
          {subscribedSources.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Episode selector */}
      {sourceId && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>Episode</label>
          {state === "loading-episodes" ? (
            <div className="flex items-center gap-2 py-2 text-xs" style={{ color: "var(--txt-4)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading episodes…
            </div>
          ) : episodes.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "var(--txt-4)" }}>No episodes found.</p>
          ) : (
            <select
              value={episodeId}
              onChange={(e) => { setEpisodeId(e.target.value); setState("idle"); setMessage(""); }}
              className="input"
              disabled={busy}
            >
              <option value="">— choose an episode —</option>
              {episodes.map((ep) => (
                <option key={ep.id} value={ep.id}>{epLabel(ep)}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Legend */}
      {episodes.length > 0 && (
        <p className="text-xs" style={{ color: "var(--txt-4)" }}>
          ✓ = insights ready · ⏳ = processing queued · ○ = not yet processed
        </p>
      )}

      {/* Action button */}
      {episodeId && selectedEpisode && (
        <div className="space-y-2 pt-1">
          {selectedStatus === "processed" && (
            <button
              onClick={handleSend}
              disabled={busy || state === "sent"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border disabled:opacity-60"
              style={{
                background:  state === "sent" ? "var(--bg-elevated)" : "var(--acc)",
                borderColor: state === "sent" ? "var(--bdr)" : "var(--acc)",
                color:       state === "sent" ? "var(--txt-2)" : "#fff",
              }}
            >
              {state === "sending" && <Loader2 className="w-4 h-4 animate-spin" />}
              {state === "sent"    && <CheckCircle className="w-4 h-4" style={{ color: "#34D399" }} />}
              {(state === "idle" || state === "error") && <Send className="w-4 h-4" />}
              {state === "sending" ? "Sending…" : state === "sent" ? "Digest sent!" : "Send Episode Digest"}
            </button>
          )}

          {selectedStatus === "queued" && (
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 text-white"
              style={{ background: "#6b7280" }}
            >
              <Clock className="w-4 h-4 animate-pulse" />
              {isAutoSendPending ? "Processing — will send when ready…" : "Processing Queued"}
            </button>
          )}

          {selectedStatus === "unprocessed" && (
            <button
              onClick={handleProcess}
              disabled={busy || state === "queued"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 text-white"
              style={{ background: state === "queued" ? "#6b7280" : "#7c3aed" }}
            >
              {state === "processing"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : state === "queued"
                ? <CheckCircle className="w-4 h-4" style={{ color: "#34D399" }} />
                : <Zap className="w-4 h-4" />}
              {state === "processing" ? "Queueing…" : state === "queued" ? "Queued!" : "Process & Send Digest"}
            </button>
          )}

          {/* Status / help messages */}
          {(state === "queued" || selectedStatus === "queued") && state !== "error" && (
            <p className="text-xs" style={{ color: "var(--txt-4)" }}>
              {isAutoSendPending
                ? "Processing in background (~3–5 min) — digest will be emailed to you automatically when done."
                : "Processing in background — select this episode again and click \"Send Episode Digest\" when the ⏳ turns to ✓."}
            </p>
          )}

          {message && state !== "queued" && selectedStatus !== "queued" && (
            <p className="text-xs flex items-start gap-1.5" style={{ color: state === "error" ? "#F87171" : "var(--txt-4)" }}>
              {state === "error" && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
              {message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function formatDate(raw: string): string {
  try {
    return new Date(raw).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return raw;
  }
}
