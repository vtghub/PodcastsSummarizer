"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Rss, Video, Plus, Trash2, PowerOff, Power, X, Loader2 } from "lucide-react";
import { getDomainColor } from "@/lib/domain-colors";
import type { Source } from "@/lib/db";

const DOMAINS = [
  "Technology & AI",
  "Business & Startups",
  "Health & Science",
  "Finance & Investing",
  "Leadership & Productivity",
  "Society & Culture",
  "Other",
];

const EMPTY_FORM = { name: "", url: "", source_type: "rss" as const, domain: "Technology & AI" };

export default function PodcastManager({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null); // id of card being mutated

  const refresh = () => startTransition(() => router.refresh());

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to add podcast");
        return;
      }
      setShowAdd(false);
      setForm(EMPTY_FORM);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(source: Source) {
    setActionId(source.id);
    try {
      await fetch(`/api/sources/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !source.enabled }),
      });
      refresh();
    } finally {
      setActionId(null);
    }
  }

  async function handleDelete(source: Source) {
    if (!confirm(`Delete "${source.name}"? This cannot be undone.`)) return;
    setActionId(source.id);
    try {
      await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      refresh();
    } finally {
      setActionId(null);
    }
  }

  const enabled  = sources.filter((s) => s.enabled);
  const disabled = sources.filter((s) => !s.enabled);

  return (
    <>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">My Podcasts</h1>
          <p className="text-slate-400 text-sm mt-1">
            {sources.length} source{sources.length !== 1 ? "s" : ""}
            &nbsp;·&nbsp;
            {enabled.length} active
            {isPending && <span className="ml-2 text-slate-500">refreshing…</span>}
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setError(""); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Podcast
        </button>
      </div>

      {/* Source grid */}
      {sources.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">🎙</span>
          <h2 className="text-lg font-semibold text-slate-200 mb-2">No podcasts yet</h2>
          <p className="text-slate-400 text-sm max-w-sm">
            Click <strong>Add Podcast</strong> to add your first RSS or YouTube source.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {enabled.length > 0 && (
            <Section title="Active" sources={enabled} actionId={actionId}
              onToggle={handleToggle} onDelete={handleDelete} />
          )}
          {disabled.length > 0 && (
            <Section title="Disabled" sources={disabled} actionId={actionId} muted
              onToggle={handleToggle} onDelete={handleDelete} />
          )}
        </div>
      )}

      {/* Add dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0d1117] shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-slate-100">Add Podcast</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <Field label="Name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Lex Fridman Podcast"
                  className="input"
                />
              </Field>

              <Field label="RSS / YouTube URL">
                <input
                  required
                  type="url"
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                  placeholder="https://feeds.example.com/feed.rss"
                  className="input"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={form.source_type}
                    onChange={(e) => setForm({ ...form, source_type: e.target.value as "rss" | "youtube" })}
                    className="input"
                  >
                    <option value="rss">RSS</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </Field>

                <Field label="Domain">
                  <select
                    value={form.domain}
                    onChange={(e) => setForm({ ...form, domain: e.target.value })}
                    className="input"
                  >
                    {DOMAINS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </Field>
              </div>

              {error && (
                <p className="text-sm text-red-400 rounded-lg bg-red-950/40 border border-red-800 px-3 py-2">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-700 text-slate-300 text-sm hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? "Adding…" : "Add Podcast"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Section({
  title, sources, muted = false, actionId, onToggle, onDelete,
}: {
  title: string;
  sources: Source[];
  muted?: boolean;
  actionId: string | null;
  onToggle: (s: Source) => void;
  onDelete: (s: Source) => void;
}) {
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <SourceCard key={s.id} source={s} muted={muted}
            busy={actionId === s.id}
            onToggle={() => onToggle(s)}
            onDelete={() => onDelete(s)}
          />
        ))}
      </div>
    </section>
  );
}

function SourceCard({
  source, muted, busy, onToggle, onDelete,
}: {
  source: Source;
  muted: boolean;
  busy: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const color = getDomainColor(source.domain);
  const isYT  = source.source_type === "youtube";

  return (
    <div className={`rounded-xl border ${muted ? "border-slate-800 bg-slate-900/40 opacity-70" : "border-slate-800 bg-slate-900"} p-5 flex flex-col gap-3 relative`}>
      {busy && (
        <div className="absolute inset-0 rounded-xl bg-slate-900/60 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isYT
            ? <Video className="w-4 h-4 flex-shrink-0 text-red-400" />
            : <Rss   className="w-4 h-4 flex-shrink-0 text-orange-400" />
          }
          <span className="font-semibold text-slate-200 text-sm truncate">{source.name}</span>
        </div>
        <span className={`flex-shrink-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
          {source.domain}
        </span>
      </div>

      {/* URL */}
      <p className="text-xs text-slate-500 font-mono truncate" title={source.url}>
        {source.url}
      </p>

      {/* Footer actions */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className={`text-xs ${muted ? "text-slate-600" : "text-emerald-400"}`}>
          {muted ? "disabled" : "active"}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggle}
            title={source.enabled ? "Disable" : "Enable"}
            className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {source.enabled
              ? <PowerOff className="w-3.5 h-3.5" />
              : <Power    className="w-3.5 h-3.5 text-emerald-500" />
            }
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            className="p-1.5 rounded-md text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
