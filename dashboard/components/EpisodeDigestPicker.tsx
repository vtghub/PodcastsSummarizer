"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Send, CheckCircle, AlertCircle, Zap } from "lucide-react";
import type { Source, EpisodeItem } from "@/lib/db";

type ButtonState = "idle" | "loading-episodes" | "sending" | "processing" | "sent" | "queued" | "error";

interface Props {
  subscribedSources: Source[];
}

export default function EpisodeDigestPicker({ subscribedSources }: Props) {
  const [sourceId, setSourceId]     = useState("");
  const [episodes, setEpisodes]     = useState<EpisodeItem[]>([]);
  const [episodeId, setEpisodeId]   = useState("");
  const [state, setState]           = useState<ButtonState>("idle");
  const [message, setMessage]       = useState("");
  const [pollTimer, setPollTimer]   = useState<ReturnType<typeof setInterval> | null>(null);

  const selectedEpisode = episodes.find((e) => e.id === episodeId);

  // Fetch episodes when source changes
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

  useEffect(() => {
    loadEpisodes(sourceId);
  }, [sourceId, loadEpisodes]);

  // Stop polling on unmount
  useEffect(() => () => { if (pollTimer) clearInterval(pollTimer); }, [pollTimer]);

  async function handleSend() {
    if (!selectedEpisode) return;
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/digest/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episodeId: selectedEpisode.id }),
      });
      const data = await res.json();
      if (!res.ok) { setState("error"); setMessage(data.error ?? "Failed to send digest"); }
      else {
        setState("sent");
        setMessage(`Digest sent — ${data.count} insight${data.count !== 1 ? "s" : ""} from ${data.date}`);
        setTimeout(() => { setState("idle"); setMessage(""); }, 8000);
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
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
      if (!res.ok) { setState("error"); setMessage(data.error ?? "Failed to queue processing"); return; }

      setState("queued");
      setMessage("Processing started — polling for completion…");

      // Poll every 10s for up to 10 minutes
      let attempts = 0;
      const timer = setInterval(async () => {
        attempts++;
        if (attempts > 60) {
          clearInterval(timer);
          setState("queued");
          setMessage("Still processing — you'll receive an email when ready.");
          return;
        }
        try {
          const statusRes = await fetch(`/api/digest/status?episodeId=${selectedEpisode.id}`);
          const status = await statusRes.json();
          if (status.processed) {
            clearInterval(timer);
            // Mark episode as processed in local state so dropdown shows ✓
            setEpisodes((prev) =>
              prev.map((ep) => ep.id === selectedEpisode.id ? { ...ep, processed: true } : ep)
            );
            // Auto-send the digest now that insights are ready
            const sendRes = await fetch("/api/digest/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ episodeId: selectedEpisode.id }),
            });
            const sendData = await sendRes.json();
            if (sendRes.ok) {
              setState("sent");
              setMessage(`Processing complete! Digest sent — ${sendData.count} insight${sendData.count !== 1 ? "s" : ""}.`);
              setTimeout(() => { setState("idle"); setMessage(""); }, 10000);
            } else {
              setState("error");
              setMessage(sendData.error ?? "Processing done but email send failed");
            }
          }
        } catch { /* ignore polling errors */ }
      }, 10000);
      setPollTimer(timer);
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
  }

  const busy = state === "sending" || state === "processing" || state === "loading-episodes";
  const isProcessed = selectedEpisode?.processed ?? false;

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
                <option key={ep.id} value={ep.id}>
                  {ep.processed ? "✓ " : "○ "}{ep.title}
                  {ep.publishedAt ? ` (${formatDate(ep.publishedAt)})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Legend */}
      {episodes.length > 0 && (
        <p className="text-xs" style={{ color: "var(--txt-4)" }}>
          ✓ = insights ready · ○ = needs processing (~3–5 min)
        </p>
      )}

      {/* Action button */}
      {episodeId && selectedEpisode && (
        <div className="space-y-2 pt-1">
          {isProcessed ? (
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
              {state === "idle" || state === "error" ? <Send className="w-4 h-4" /> : null}
              {state === "sending" ? "Sending…" : state === "sent" ? "Digest sent!" : "Send Episode Digest"}
            </button>
          ) : (
            <button
              onClick={handleProcess}
              disabled={busy || state === "queued" || state === "sent"}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60 text-white"
              style={{ background: state === "queued" || state === "sent" ? "#6b7280" : "#7c3aed" }}
            >
              {state === "processing" || state === "queued"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : state === "sent"
                ? <CheckCircle className="w-4 h-4" style={{ color: "#34D399" }} />
                : <Zap className="w-4 h-4" />
              }
              {state === "processing" ? "Queueing…"
                : state === "queued"  ? "Processing…"
                : state === "sent"    ? "Done!"
                : "Process & Send Digest"}
            </button>
          )}

          {message && (
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
