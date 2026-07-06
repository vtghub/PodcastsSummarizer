"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Rss, Video, Plus, Trash2, PowerOff, Power, X, Loader2,
  Lock, Bell, BellOff, Search,
} from "lucide-react";
import type { Source, PlatformLinks } from "@/lib/db";
import type { PodcastSearchResult } from "@/app/api/podcasts/search/route";
import { getDomainColor, DOMAINS as DOMAIN_ORDER } from "@/lib/domain-colors";


const DOMAIN_KEY: Record<string, string> = {
  "Technology & AI":           "tech",
  "Business & Startups":       "biz",
  "Health & Science":          "hlth",
  "Finance & Investing":       "fin",
  "Leadership & Productivity": "lead",
  "Society & Culture":         "soc",
  "Other":                     "oth",
};

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

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PodcastSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); setShowResults(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/podcasts/search?q=${encodeURIComponent(q)}`);
      const data: PodcastSearchResult[] = await res.json();
      setSearchResults(data);
      setShowResults(data.length > 0);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => runSearch(q), 350);
  }

  function handlePickResult(r: PodcastSearchResult) {
    setForm({ ...form, name: r.name, url: r.feedUrl, source_type: "rss" });
    setSearchQuery(r.name);
    setShowResults(false);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function openAdd() {
    setShowAdd(true);
    setError("");
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
    setForm(EMPTY_FORM);
  }

  const refresh = () => startTransition(() => router.refresh());

  async function handleSubscribe(source: Source) {
    if (!isAuthed) { router.push("/login?from=/podcasts"); return; }
    setActionId(source.id);
    const isSubscribed = localSubs.has(source.id);
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

  // Group sources by domain, preserving canonical order
  const domainGroups = DOMAIN_ORDER.reduce<Record<string, Source[]>>((acc, domain) => {
    const inDomain = sources.filter((s) => s.domain === domain);
    if (inDomain.length > 0) acc[domain] = inDomain;
    return acc;
  }, {});

  const activeDomains = DOMAIN_ORDER.filter((d) => domainGroups[d]);

  const [selectedDomain, setSelectedDomain] = useState<string>(() => activeDomains[0] ?? "");

  return (
    <>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--txt-1)" }}>Podcast Catalog</h1>
          <p className="text-sm mt-1" style={{ color: "var(--txt-3)" }}>
            {sources.length} podcast{sources.length !== 1 ? "s" : ""}
            {" across "}
            {activeDomains.length} domain{activeDomains.length !== 1 ? "s" : ""}
            {isAuthed && localSubs.size > 0 && (
              <>
                &nbsp;·&nbsp;
                <span style={{ color: "var(--acc)" }}>{localSubs.size} subscribed</span>
              </>
            )}
            {isPending && <span className="ml-2" style={{ color: "var(--txt-4)" }}>refreshing…</span>}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-shrink-0 text-white"
            style={{ background: "var(--acc)" }}
          >
            <Plus className="w-4 h-4" />
            Add to Catalog
          </button>
        )}
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

      {/* Domain tabs + cards */}
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
        <>
          {/* Domain tabs */}
          <div className="flex flex-wrap gap-2 mb-8">
            {activeDomains.map((domain) => {
              const c = getDomainColor(domain);
              const active = domain === selectedDomain;
              return (
                <button
                  key={domain}
                  onClick={() => setSelectedDomain(domain)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active ? `${c.bg} ${c.text} ${c.border} shadow-sm` : "opacity-50 hover:opacity-80"
                  }`}
                  style={active ? {} : { background: "var(--bg-elevated)", borderColor: "var(--bdr)", color: "var(--txt-3)" }}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                  {domain}
                  <span className={active ? "opacity-70" : "opacity-50"}>
                    ({domainGroups[domain].length})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active domain cards */}
          {selectedDomain && domainGroups[selectedDomain] && (
            <DomainSection
              domain={selectedDomain}
              sources={domainGroups[selectedDomain]}
              subscribedIds={localSubs}
              actionId={actionId}
              isAuthed={isAuthed}
              isAdmin={isAdmin}
              onSubscribe={handleSubscribe}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          )}
        </>
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
              <Field label="Search Podcast">
                <div ref={searchRef} className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--txt-4)" }} />
                    {searching
                      ? <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: "var(--txt-4)" }} />
                      : searchQuery && (
                        <button type="button" onClick={() => { setSearchQuery(""); setSearchResults([]); setShowResults(false); setForm(EMPTY_FORM); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--txt-4)" }}>
                          <X className="w-4 h-4" />
                        </button>
                      )
                    }
                    <input
                      value={searchQuery}
                      onChange={handleSearchChange}
                      onFocus={() => searchResults.length > 0 && setShowResults(true)}
                      placeholder="Search by podcast name…"
                      className="input"
                      style={{ paddingLeft: "2.25rem", paddingRight: "2.25rem" }}
                      autoComplete="off"
                    />
                  </div>
                  {showResults && (
                    <ul
                      className="absolute z-10 w-full mt-1 rounded-xl border shadow-xl overflow-hidden"
                      style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
                    >
                      {searchResults.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => handlePickResult(r)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:opacity-80"
                            style={{ background: "transparent" }}
                          >
                            {r.artworkUrl
                              ? <img src={r.artworkUrl} alt="" className="w-9 h-9 rounded-md flex-shrink-0 object-cover" />
                              : <div className="w-9 h-9 rounded-md flex-shrink-0" style={{ background: "var(--bg-elevated)" }} />
                            }
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate" style={{ color: "var(--txt-1)" }}>{r.name}</p>
                              {r.publisher && r.publisher !== r.name && (
                                <p className="text-xs truncate" style={{ color: "var(--txt-4)" }}>{r.publisher}</p>
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>

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

// ── Domain section ──────────────────────────────────────────────────────────

function DomainSection({
  domain, sources, subscribedIds, actionId, isAuthed, isAdmin,
  onSubscribe, onToggle, onDelete,
}: {
  domain: string; sources: Source[]; subscribedIds: Set<string>;
  actionId: string | null; isAuthed: boolean; isAdmin: boolean;
  onSubscribe: (s: Source) => void; onToggle: (s: Source) => void; onDelete: (s: Source) => void;
}) {
  const dk = DOMAIN_KEY[domain] ?? "oth";
  // Subscribed sources float to the top within each domain
  const sorted = [...sources].sort((a, b) => {
    const aS = subscribedIds.has(a.id) ? 0 : 1;
    const bS = subscribedIds.has(b.id) ? 0 : 1;
    return aS - bS;
  });

  return (
    <section>
      {/* Domain header */}
      <div className="flex items-center gap-3 mb-5">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: `var(--d-${dk}-dot)` }}
        />
        <h2
          className="text-xs font-bold uppercase tracking-widest flex-shrink-0"
          style={{ color: "var(--txt-1)" }}
        >
          {domain}
        </h2>
        <div className="flex-1 h-px" style={{ background: "var(--bdr)" }} />
        <span className="text-xs flex-shrink-0" style={{ color: "var(--txt-4)" }}>
          {sources.length} podcast{sources.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((s) => (
          <SourceCard
            key={s.id}
            source={s}
            subscribed={subscribedIds.has(s.id)}
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

// ── Source card ─────────────────────────────────────────────────────────────

function SourceCard({
  source, subscribed, busy, isAuthed, isAdmin,
  onSubscribe, onToggle, onDelete,
}: {
  source: Source; subscribed: boolean; busy: boolean;
  isAuthed: boolean; isAdmin: boolean;
  onSubscribe: () => void; onToggle: () => void; onDelete: () => void;
}) {
  const dk = DOMAIN_KEY[source.domain] ?? "oth";
  const isYT = source.source_type === "youtube";
  const links = source.platform_links ?? {};
  const hasLinks = Object.values(links).some(Boolean);

  return (
    <div
      className="rounded-xl border flex flex-col relative transition-all overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        borderColor: subscribed ? "var(--bdr-strong)" : "var(--bdr)",
        boxShadow: subscribed ? "0 0 0 1px var(--bdr-strong)" : undefined,
      }}
    >
      {/* Domain color stripe — soft pastel tint */}
      <div className="h-1 w-full flex-shrink-0" style={{ background: `var(--d-${dk}-bdr)` }} />

      <div className="p-4 flex flex-col gap-3 flex-1">
        {busy && (
          <div className="absolute inset-0 rounded-xl flex items-center justify-center" style={{ background: "var(--bg-quote)" }}>
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--txt-3)" }} />
          </div>
        )}

        {/* Name + source type */}
        <div className="flex items-start gap-2 min-w-0">
          <span className="flex-shrink-0 mt-0.5">
            {isYT
              ? <Video className="w-4 h-4 text-red-400" />
              : <Rss   className="w-4 h-4 text-orange-400" />
            }
          </span>
          <span
            className="font-semibold text-sm leading-snug"
            style={{ color: "var(--txt-1)" }}
            title={source.url}
          >
            {source.name}
          </span>
          {!source.enabled && isAdmin && (
            <span
              className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded border mt-0.5"
              style={{ color: "var(--txt-4)", borderColor: "var(--bdr)", fontSize: "0.65rem" }}
            >
              off
            </span>
          )}
        </div>

        {/* Platform links */}
        {hasLinks && <PlatformLinksMini links={links} />}

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-1">
          <button
            onClick={onSubscribe}
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors border"
            style={subscribed
              ? { background: "var(--acc-bg)", borderColor: "var(--acc)", color: "var(--acc-txt)" }
              : { background: "transparent", borderColor: "var(--bdr)", color: "var(--txt-3)" }
            }
          >
            {subscribed
              ? <><BellOff className="w-3 h-3" /> Subscribed</>
              : <><Bell    className="w-3 h-3" /> Subscribe</>
            }
          </button>

          {isAdmin && (
            <div className="flex items-center gap-1">
              <button
                onClick={onToggle}
                title={source.enabled ? "Disable in pipeline" : "Enable in pipeline"}
                className="p-1.5 rounded-md transition-colors hover:opacity-70"
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
                className="p-1.5 rounded-md transition-colors hover:opacity-70"
                style={{ color: "var(--txt-4)" }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Platform links mini-row ─────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, { label: string; color: string; svg: React.ReactElement }> = {
  spotify: {
    label: "Spotify",
    color: "#1DB954",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    ),
  },
  apple: {
    label: "Apple Podcasts",
    color: "#B150E2",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
        <path d="M12.002 1c6.075 0 10.998 4.923 10.998 10.998S18.077 23 12.002 23C5.927 23 1 18.073 1 11.998S5.923 1 12.002 1zm0 1.5C6.75 2.5 2.5 6.75 2.5 11.998 2.5 17.25 6.75 21.5 12.002 21.5 17.25 21.5 21.5 17.25 21.5 11.998 21.5 6.75 17.25 2.5 12.002 2.5zm0 2.77a6.73 6.73 0 110 13.46A6.73 6.73 0 0112 5.27zm0 1.5a5.23 5.23 0 100 10.46A5.23 5.23 0 0012 6.77zm0 1.98c.69 0 1.25.56 1.25 1.25 0 .53-.33.98-.8 1.16v4.09c0 .25-.2.45-.45.45s-.45-.2-.45-.45v-4.09a1.253 1.253 0 01-.8-1.16c0-.69.56-1.25 1.25-1.25z" />
      </svg>
    ),
  },
  youtube: {
    label: "YouTube",
    color: "#FF0000",
    svg: (
      <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13">
        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  website: {
    label: "Website",
    color: "var(--txt-3)",
    svg: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
};

function PlatformLinksMini({ links }: { links: PlatformLinks }) {
  const entries = (["spotify", "apple", "youtube", "website"] as const).filter((k) => links[k]);
  if (entries.length === 0) return null;
  return (
    <div className="flex items-center gap-2">
      {entries.map((key) => {
        const { label, color, svg } = PLATFORM_ICONS[key];
        return (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel="noopener noreferrer"
            title={label}
            className="flex items-center justify-center rounded transition-opacity hover:opacity-70"
            style={{ color }}
          >
            {svg}
          </a>
        );
      })}
    </div>
  );
}

// ── Shared ──────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium" style={{ color: "var(--txt-3)" }}>{label}</label>
      {children}
    </div>
  );
}
