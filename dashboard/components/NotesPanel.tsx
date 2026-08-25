"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";
import NoteRow, { type EpisodeNote } from "./NoteRow";

const AUTOSAVE_DELAY_MS = 600;

// Expandable "My Notes" panel on an insight card — lazy-loads the signed-in
// user's notes for this episode on mount (parent only mounts this when the
// panel is expanded), and auto-creates a new note ~600ms after the user
// stops typing in the "Add a note" box, same debounce shape as editing an
// existing note (NoteRow).
export default function NotesPanel({ episodeId }: { episodeId: string }) {
  const [notes, setNotes] = useState<EpisodeNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const createTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/episodes/${episodeId}/notes`)
      .then((r) => r.json())
      .then((d) => setNotes(d.notes ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [episodeId]);

  useEffect(() => {
    return () => {
      if (createTimer.current) clearTimeout(createTimer.current);
    };
  }, []);

  const scheduleCreate = useCallback((body: string) => {
    if (createTimer.current) clearTimeout(createTimer.current);
    createTimer.current = setTimeout(async () => {
      const trimmed = body.trim();
      if (!trimmed) return;
      setCreating(true);
      try {
        const res = await fetch(`/api/episodes/${episodeId}/notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: trimmed }),
        });
        const data = await res.json();
        if (res.ok && data.note) {
          setNotes((prev) => [...prev, data.note]);
          setNewBody("");
        }
      } catch {
        // leave the draft text in place so nothing typed is lost
      } finally {
        setCreating(false);
      }
    }, AUTOSAVE_DELAY_MS);
  }, [episodeId]);

  function handleNewBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setNewBody(next);
    scheduleCreate(next);
  }

  function handleDeleteNote(id: number) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <div className="border-t" style={{ borderColor: "var(--bdr)" }}>
      {loading ? (
        <div className="px-5 py-4 text-xs text-center" style={{ color: "var(--txt-4)" }}>Loading notes…</div>
      ) : (
        <>
          {notes.length === 0 && (
            <p className="px-5 py-4 text-xs text-center" style={{ color: "var(--txt-4)" }}>
              Private to you — jot down anything worth remembering about this episode.
            </p>
          )}
          {notes.length > 0 && (
            <div className="divide-y" style={{ borderColor: "var(--bdr)" }}>
              {notes.map((n) => (
                <NoteRow key={n.id} note={n} onDelete={handleDeleteNote} />
              ))}
            </div>
          )}
          <div className="flex items-start gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--bdr)" }}>
            <textarea
              value={newBody}
              onChange={handleNewBodyChange}
              placeholder="Add a note…"
              maxLength={4000}
              rows={1}
              className="flex-1 text-sm px-3 py-1.5 rounded-lg outline-none resize-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--bdr)",
                color: "var(--txt-1)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--acc)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--bdr)")}
            />
            {creating && <Loader2 className="w-3.5 h-3.5 animate-spin mt-2 flex-shrink-0" style={{ color: "var(--txt-4)" }} />}
          </div>
        </>
      )}
    </div>
  );
}
