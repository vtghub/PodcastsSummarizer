"use client";

import { useState } from "react";
import { Send, Loader2, CheckCircle, AlertCircle, Eye } from "lucide-react";

export default function SendDigestButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSend() {
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/digest/send", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setState("error");
        setMessage(data.error ?? "Failed to send digest");
      } else {
        setState("sent");
        setMessage(`Digest sent — ${data.count} insight${data.count !== 1 ? "s" : ""} from ${data.date}`);
        setTimeout(() => setState("idle"), 6000);
      }
    } catch {
      setState("error");
      setMessage("Network error — please try again");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={handleSend}
          disabled={state === "sending" || state === "sent"}
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
          {state === "sending" ? "Sending…" : state === "sent" ? "Digest sent!" : "Send Digest Now"}
        </button>

        <a
          href="/api/digest/preview"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors"
          style={{ borderColor: "var(--bdr)", color: "var(--txt-3)", background: "var(--bg-elevated)" }}
        >
          <Eye className="w-4 h-4" />
          Preview
        </a>
      </div>

      {message && (
        <p className="text-xs flex items-center gap-1.5" style={{ color: state === "error" ? "#F87171" : "var(--txt-4)" }}>
          {state === "error" && <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
          {message}
        </p>
      )}
    </div>
  );
}
