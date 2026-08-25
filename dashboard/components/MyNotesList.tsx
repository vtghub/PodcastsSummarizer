"use client";

import { useState } from "react";
import { StickyNote, ChevronDown, ChevronUp, CalendarDays } from "lucide-react";
import { getDomainColor } from "@/lib/domain-colors";
import NoteRow, { type EpisodeNote } from "@/components/NoteRow";

export interface EpisodeNoteGroup {
  episode_id: string;
  episode_title: string;
  episode_published_at: string | null;
  source_name: string | null;
  domain: string;
  notes: EpisodeNote[];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function MyNotesList({ groups }: { groups: EpisodeNoteGroup[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(groups[0]?.episode_id ?? null);
  const [localGroups, setLocalGroups] = useState(groups);

  function handleDeleteNote(episodeId: string, noteId: number) {
    setLocalGroups((prev) =>
      prev
        .map((g) => (g.episode_id === episodeId ? { ...g, notes: g.notes.filter((n) => n.id !== noteId) } : g))
        .filter((g) => g.notes.length > 0)
    );
  }

  if (localGroups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border"
        style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}
      >
        <StickyNote className="w-10 h-10 mb-4" style={{ color: "var(--txt-4)" }} />
        <p className="text-sm font-medium" style={{ color: "var(--txt-3)" }}>No notes yet</p>
        <p className="text-xs mt-1" style={{ color: "var(--txt-4)" }}>
          Click the notes icon on any insight card to jot one down.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--bdr)", background: "var(--bg-surface)" }}>
      <div className="divide-y" style={{ borderColor: "var(--bdr)" }}>
        {localGroups.map((g) => {
          const expanded = expandedId === g.episode_id;
          const c = getDomainColor(g.domain);
          return (
            <div key={g.episode_id}>
              <button
                onClick={() => setExpandedId(expanded ? null : g.episode_id)}
                className="w-full flex items-start gap-3 px-4 py-3 text-left"
              >
                {expanded ? (
                  <ChevronUp className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--txt-4)" }} />
                ) : (
                  <ChevronDown className="w-4 h-4 flex-shrink-0 mt-1" style={{ color: "var(--txt-4)" }} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {g.source_name && (
                      <span className={`text-xs font-bold uppercase tracking-widest ${c.text}`}>{g.source_name}</span>
                    )}
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${c.bg} ${c.text} ${c.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                      {g.domain}
                    </span>
                  </div>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--txt-1)" }}>{g.episode_title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs" style={{ color: "var(--txt-4)" }}>
                    {g.episode_published_at && (
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3 h-3" />
                        {formatDate(g.episode_published_at)}
                      </span>
                    )}
                    <span>{g.notes.length} note{g.notes.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </button>
              {expanded && (
                <div className="border-t divide-y" style={{ borderColor: "var(--bdr)" }}>
                  {g.notes.map((n) => (
                    <NoteRow key={n.id} note={n} onDelete={(id) => handleDeleteNote(g.episode_id, id)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
