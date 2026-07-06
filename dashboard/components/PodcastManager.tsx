"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Rss, Video, Plus, Trash2, PowerOff, Power, X, Loader2,
  Lock, Bell, BellOff,
} from "lucide-react";
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

type FormState = { name: string; url: string; source_type: "rss" | "youtube"; domain: string };
const EMPTY_FORM: FormState = { name: "", url: "", source_type: "rss", domain: "Technology & AI" };

interface Props {
  sources: Source[];
  subscribedIds: string[];
  isAuthed: boolean;
  isAdmin: boolean;
}

export default function PodcastManager({ sources, subscribedIds, isAuthed, isAdmin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [localSubs, setLocalSubs] = useState<Set<string>>(new Set(subscribedIds));

  const refresh = () => startTransition(() => router.refresh());

  async function handleSubscribe(source: Source) {
    if (!isAuthed) { router.push("/login?from=/podcasts"); return; }
    setActionId(source.id);
    const isSubscribed = localSubs.has(source.id);
    // Optimistic update
    setLocalSubs((prev) => {
      const next = new Set(prev);
      isSubscribed ? next.delete(source.id) : next.add(source.id);
      return next;
    });
    try {
      if (isSubscribed) {
        await fetch(`/api/subscriptions/${source.id}`, { method: "DELETE" });
      } else {
        await fetch("/api/subscriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: source.id }),
        });
      }
    } catch {
      // Revert optimistic update on error
      setLocalSubs((prev) => {
        const next = new Set(prev);
        isSubscribed ? next.add(source.id) : next.delete(source.id);
        return next;
      });
    } finally {
      setActionId(null);
    }
  }

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
    if (!confirm(`Remove "${source.name}" from the catalog? This cannot be undone.`)) return;
    setActionId(source.id);
    try {
      await fetch(`/api/sources/${source.id}`, { method: "DELETE" });
      refresh();
    } finally {
      setActionId(null);
    }
  }

  const subscribedSources  = sources.filter((s) => localSubs.has(s.id));
  const unsubscribedSources = sources.filter((s) => !localSubs.has(s.id));

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Podcast Catalog</h1>
          <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
            {sources.length} podcast{sources.length !== 1 ? "s" : ""}
            {isAuthed && (
              <>
                &nbsp;·&nbsp;
                <span style={{ color: "var(--acc)" }}>{localSubs.size} subscribed</span>
              </>
            )}
            {isPending && <span className="ml-2" style={{ color: "var(--txt-4)" }}>refreshing…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAdmin && (
            <button
              onClick={() => { setShowAdd(true); setError(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors text-white"
              style={{ background: "var(--acc)" }}
            >
              <Plus className="w-4 h-4" />
              Add to Catalog
            </button>
          )}
        </div>
      </div>

      {/* Guest notice */}
      {!isAuthed && (
        <div
          className="flex items-center gap-2 mb-6 px-4 py-3 rounded-lg border text-sm"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }}
        >
          <Lock className="w-4 h-4 flex-shrink-0" style={{ color: "var(--acc)" }} />
          <span>
            <a href="/login?from=/podcasts" style={{ color: "var(--acc)" }} className="font-medium hover:underline">
              Sign in
            </a>{" "}
            to subscribe to podcasts and get a personalised daily digest.
          </span>
        </div>
      )}

      {/* Source grid */}
      {sources.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <span className="text-5xl mb-4">🎙</span>
          <h2 className="text-lg font-semibold mb-2" style={{ color: "var(--txt-1)" }}>No podcasts yet</h2>
          {isAdmin && (
            <p className="text-sm max-w-sm" style={{ color: "var(--txt-3)" }}>
              Click <strong>Add to Catalog</strong> to add the first RSS or YouTube source.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {subscribedSources.length > 0 && (
            <CatalogSection
              title="Your Subscriptions"
              sources={subscribedSources}
              subscribedIds={localSubs}
              actionId={actionId}
              isAuthed={isAuthed}
              isAdmin={isAdmin}
              onSubscribe={handleSubscribe}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
          {unsubscribedSources.length > 0 && (
            <CatalogSection
              title={subscribedSources.length > 0 ? "Available" : "All Podcasts"}
              sources={unsubscribedSources}
              subscribedIds={localSubs}
              actionId={actionId}
              isAuthed={isAuthed}
              isAdmin={isAdmin}
              onSubscribe={handleSubscribe}
              onToggle={handleToggle}
              onDelete={handleDelete}
              muted
            />
          )}
        </div>
      )}

      {/* Add to catalog dialog (admin only) */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div
            className="w-full max-w-md rounded-2xl border shadow-2xl p-6"
            style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold" style={{ color: "var(--txt-1)" }}>Add to Catalog</h2>
              <button onClick={() => setShowAdd(false)} className="transition-colors" style={{ color: "var(--txt-4)" }}>
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
                <p className="text-sm rounded-lg px-3 py-2" style={{ color: "#F87171", background: "rgba(127,29,29,0.3)", border: "1px solid rgba(185,28,28,0.4)" }}>{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 px-4 py-2 rounded-lg text-sm transition-colors border"
                  style={{ borderColor: "var(--bdr)", color: "var(--txt-2)" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 text-white"
                  style={{ background: "var(--acc)" }}
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

function CatalogSection({
  title, sources, subscribedIds, muted = false, actionId,
  isAuthed, isAdmin, onSubscribe, onToggle, onDelete,
}: {
  title: string; sources: Source[]; subscribedIds: Set<string>;
  muted?: boolean; isAuthed: boolean; isAdmin: boolean; actionId: string | null;
  onSubscribe: (s: Source) => void; onToggle: (s: Source) => void; onDelete: (s: Source) => void;
}) {
  return (
    <section>
      <h2 className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "var(--txt-4)" }}>{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            subscribed={subscribedIds.has(s.id)}
            muted={muted}
            isAuthed={isAuthed}
            isAdmin={isAdmin}
            busy={actionId === s.id}
            onSubscribe={() => onSubscribe(s)}
            onToggle={() => onToggle(s)}
            onDelete={() => onDelete(s)}
          />
        ))}
      </div>
    </section>
  );
}

function SourceCard({
  source, subscribed, muted, busy, isAuthed, isAdmin,
  onSubscribe, onToggle, onDelete,
}: {
  source: Source; subscribed: boolean; muted: boolean; busy: boolean;
  isAuthed: boolean; isAdmin: boolean;
  onSubscribe: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const color = getDomainColor(source.domain);
  const isYT  = source.source_type === "youtube";

  return (
    <div
      className="rounded-xl border p-5 flex flex-col gap-3 relative transition-all min-w-0 overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        borderColor: subscribed ? "var(--acc)" : "var(--bdr)",
        opacity: muted && !subscribed ? 0.7 : 1,
        boxShadow: subscribed ? "0 0 0 1px var(--acc)" : undefined,
      }}
    >
      {busy && (
        <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-quote)" }}>
          <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-3)" }} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isYT
            ? <Video className="w-4 h-4 flex-shrink-0 text-red-400" />
            : <Rss   className="w-4 h-4 flex-shrink-0 text-orange-400" />
          }
          <span className="font-semibold text-sm truncate" style={{ color: "var(--txt-2)" }}>{source.name}</span>
        </div>
        <span className={`flex-shrink min-w-0 flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color.bg} ${color.text} ${color.border}`}>
          <span className={`w-1.5 h-1.5 flex-shrink-0 rounded-full ${color.dot}`} />
          <span className="truncate">{source.domain}</span>
        </span>
      </div>

      {/* URL */}
      <p className="text-xs font-mono truncate" style={{ color: "var(--txt-4)" }} title={source.url}>
        {source.url}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        {/* Subscribe toggle */}
        <button
          onClick={onSubscribe}
          title={subscribed ? "Unsubscribe" : "Subscribe"}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors border"
          style={subscribed
            ? { background: "var(--acc)", borderColor: "var(--acc)", color: "#fff" }
            : { background: "transparent", borderColor: "var(--bdr)", color: "var(--txt-3)" }
          }
        >
          {subscribed
            ? <><BellOff className="w-3 h-3" /> Subscribed</>
            : <><Bell    className="w-3 h-3" /> Subscribe</>
          }
        </button>

        {/* Admin controls */}
        {isAdmin && (
          <div className="flex items-center gap-1">
            <button
              onClick={onToggle}
              title={source.enabled ? "Disable in pipeline" : "Enable in pipeline"}
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "var(--txt-4)" }}
            >
              {source.enabled
                ? <PowerOff className="w-3.5 h-3.5" />
                : <Power    className="w-3.5 h-3.5" style={{ color: "#34D399" }} />
              }
            </button>
            <button
              onClick={onDelete}
              title="Remove from catalog"
              className="p-1.5 rounded-md transition-colors"
              style={{ color: "var(--txt-4)" }}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>{label}</label>
      {children}
    </div>
  );
}
