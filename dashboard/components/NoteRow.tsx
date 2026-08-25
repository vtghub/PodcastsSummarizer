"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, X, Loader2, Check } from "lucide-react";

export interface EpisodeNote {
  id: number;
  body: string;
  created_at: string;
  updated_at: string;
}

const AUTOSAVE_DELAY_MS = 600;

function formatNoteDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// One editable note — debounced autosave on edit, optimistic delete.
// Self-contained: owns its own PATCH/DELETE calls, parent just needs to
// remove it from its list via onDelete once the delete succeeds.
export default function NoteRow({ note, onDelete }: {
  note: EpisodeNote;
  onDelete: (id: number) => void;
}) {
  const [body, setBody] = useState(note.body);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const scheduleSave = useCallback((nextBody: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const trimmed = nextBody.trim();
      if (!trimmed || trimmed === note.body) return;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/episode-notes/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
        if (!res.ok) throw new Error();
        setSaveState("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveState("idle"), 1500);
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
  }, [note.id, note.body]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setBody(next);
    scheduleSave(next);
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/episode-notes/${note.id}`, { method: "DELETE" });
      if (res.ok) onDelete(note.id);
      else setDeleting(false);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="px-4 py-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--txt-4)" }}>
          {formatNoteDate(note.updated_at)}
        </span>
        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--txt-4)" }}>
          {saveState === "saving" && <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>}
          {saveState === "saved" && <><Check className="w-3 h-3" style={{ color: "#10B981" }} /> Saved</>}
          {saveState === "error" && <span style={{ color: "#EF4444" }}>Couldn&apos;t save</span>}
        </span>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="ml-auto p-0.5 rounded"
            title="Delete note"
            style={{ color: "var(--txt-4)" }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        ) : (
          <span className="ml-auto flex items-center gap-1 text-xs" style={{ color: "var(--txt-4)" }}>
            Delete?
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-1.5 py-0.5 rounded text-xs font-medium disabled:opacity-50"
              style={{ background: "#EF444420", color: "#EF4444" }}
            >
              Yes
            </button>
            <button onClick={() => setConfirmDelete(false)} className="p-0.5 rounded" style={{ color: "var(--txt-4)" }}>
              <X className="w-3 h-3" />
            </button>
          </span>
        )}
      </div>
      <textarea
        value={body}
        onChange={handleChange}
        maxLength={4000}
        rows={2}
        className="text-sm leading-relaxed w-full outline-none resize-none rounded-lg px-2.5 py-1.5 -mx-2.5"
        style={{ color: "var(--txt-2)", background: "transparent" }}
        onFocus={(e) => (e.currentTarget.style.background = "var(--bg-input)")}
        onBlur={(e) => (e.currentTarget.style.background = "transparent")}
      />
    </div>
  );
}
