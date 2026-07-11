"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Volume2, VolumeX, Palette, UserCircle, LogOut, User, Search, X, MessageCircle, Shield, Cpu } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useTTS } from "@/contexts/TTSContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";
import { getDomainColor, DOMAINS } from "@/lib/domain-colors";

interface SearchResult {
  id: string;
  date: string;
  domain: string;
  summary: string;
  source_name: string;
  episode_title: string;
}

interface SourceOption {
  id: string;
  name: string;
  domain: string;
}

export default function NavBar({
  userEmail,
  displayName: initialDisplayName,
  newInsightCount = 0,
  isAdmin = false,
}: {
  userEmail?: string | null;
  displayName?: string | null;
  newInsightCount?: number;
  isAdmin?: boolean;
}) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  useEffect(() => {
    function onNameChange(e: Event) {
      setDisplayName((e as CustomEvent<string>).detail);
    }
    window.addEventListener("profile:displayname", onNameChange);
    return () => window.removeEventListener("profile:displayname", onNameChange);
  }, []);

  const { enabled, toggle } = useTTS();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [pickerOpen, setPickerOpen]         = useState(false);
  const [userMenuOpen, setUserMenuOpen]     = useState(false);
  const [hoveredTheme, setHoveredTheme]     = useState<typeof THEMES[0] | null>(null);
  const [searchOpen, setSearchOpen]         = useState(false);
  const [searchQuery, setSearchQuery]       = useState("");
  const [searchResults, setSearchResults]   = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading]   = useState(false);
  const [filterDomain, setFilterDomain]     = useState("");
  const [filterFrom, setFilterFrom]         = useState("");
  const [filterTo, setFilterTo]             = useState("");
  const [filterSource, setFilterSource]     = useState("");
  const [sourceOptions, setSourceOptions]   = useState<SourceOption[]>([]);
  const pickerRef    = useRef<HTMLDivElement>(null);
  const userMenuRef  = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLDivElement>(null);
  const searchInput  = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  const runSearch = useCallback(async (q: string, domain: string, from: string, to: string, source: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (domain) params.set("domain", domain);
      if (from)   params.set("from", from);
      if (to)     params.set("to", to);
      if (source) params.set("source", source);
      const res = await fetch(`/api/insights/search?${params}`);
      const data = await res.json();
      setSearchResults(data.results ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(searchQuery, filterDomain, filterFrom, filterTo, filterSource), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, filterDomain, filterFrom, filterTo, filterSource, runSearch]);

  function openSearch() {
    setSearchOpen(true);
    setTimeout(() => searchInput.current?.focus(), 50);
    if (sourceOptions.length === 0) {
      fetch("/api/sources/list")
        .then((r) => r.json())
        .then((d) => setSourceOptions(d.sources ?? []))
        .catch(() => {});
    }
  }

  function closeSearch() {
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setFilterDomain("");
    setFilterFrom("");
    setFilterTo("");
    setFilterSource("");
  }

  function handleResultClick(result: SearchResult) {
    closeSearch();
    router.push(`/dashboard?date=${result.date}&domain=${encodeURIComponent(result.domain)}&insight=${result.id}`);
    router.refresh();
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") closeSearch();
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); openSearch(); }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function handleSignOut() {
    setUserMenuOpen(false);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`transition-colors text-sm ${active ? "font-medium" : "hover:opacity-80"}`}
        style={{ color: active ? "var(--acc)" : "var(--txt-3)" }}
      >
        {label}
      </Link>
    );
  };

  const shortName = displayName || (userEmail ? userEmail.split("@")[0] : "");

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{ background: "var(--bg-nav)", borderColor: "var(--nav-bdr)", boxShadow: "var(--shadow-nav)" }}
    >
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-80" style={{ color: "var(--txt-1)" }}>
          <span className="text-lg">🎙</span>
          <span className="hidden sm:inline">Podcast Insights</span>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="hidden sm:inline relative inline-flex items-center gap-1.5">
            {navLink("/dashboard", "Dashboard")}
            {newInsightCount > 0 && (
              <span
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none"
                style={{ background: "var(--acc)", color: "#fff" }}
                title={`${newInsightCount} new insight${newInsightCount !== 1 ? "s" : ""} since your last visit`}
              >
                {newInsightCount > 99 ? "99+" : newInsightCount} new
              </span>
            )}
          </span>
          <span className="hidden sm:inline">{navLink("/podcasts", "My Podcasts")}</span>
          {userEmail && <span className="hidden sm:inline">{navLink("/analytics", "Analytics")}</span>}
          {userEmail && <span className="hidden sm:inline">{navLink("/saved", "Saved")}</span>}
          {userEmail && (
            <span className="hidden sm:inline">
              <Link
                href="/ask"
                className={`transition-colors text-sm flex items-center gap-1 ${pathname === "/ask" ? "font-medium" : "hover:opacity-80"}`}
                style={{ color: pathname === "/ask" ? "var(--acc)" : "var(--txt-3)" }}
                title="Ask questions about your podcasts"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Ask
              </Link>
            </span>
          )}
          {navLink("/about", "About")}

          {/* Search */}
          <button
            onClick={openSearch}
            title="Search insights (⌘K)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ background: "var(--bg-elevated)", color: "var(--txt-4)", border: "1px solid var(--bdr)" }}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search</span>
            <span className="hidden sm:inline text-xs opacity-50 font-mono ml-0.5">⌘K</span>
          </button>

          {/* User menu */}
          {userEmail ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                title="Account menu"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border"
                style={{
                  background: userMenuOpen ? "var(--bg-elevated)" : "var(--bg-elevated)",
                  borderColor: userMenuOpen ? "var(--bdr-hov)" : "var(--bdr)",
                  color: "var(--txt-3)",
                }}
              >
                <UserCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="hidden sm:inline max-w-[120px] truncate">{shortName}</span>
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-48 rounded-xl shadow-2xl border p-1.5 z-50"
                  style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
                >
                  <div className="px-3 py-2 mb-1 border-b" style={{ borderColor: "var(--bdr)" }}>
                    <p className="text-xs font-medium truncate" style={{ color: "var(--txt-2)" }}>{shortName}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--txt-4)" }}>{userEmail}</p>
                  </div>
                  <Link
                    href="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors"
                    style={{ color: "var(--txt-2)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <User className="w-3.5 h-3.5" style={{ color: "var(--txt-4)" }} />
                    Profile
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin/users"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ color: "var(--txt-2)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <Shield className="w-3.5 h-3.5" style={{ color: "var(--txt-4)" }} />
                      Manage Users
                    </Link>
                  )}
                  {isAdmin && (
                    <Link
                      href="/admin/llm-providers"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors"
                      style={{ color: "var(--txt-2)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <Cpu className="w-3.5 h-3.5" style={{ color: "var(--txt-4)" }} />
                      LLM Providers
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left"
                    style={{ color: "var(--txt-2)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <LogOut className="w-3.5 h-3.5" style={{ color: "var(--txt-4)" }} />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: "var(--txt-3)" }}
            >
              Sign in
            </Link>
          )}

          {/* TTS toggle */}
          <button
            onClick={toggle}
            title={enabled ? "Disable read aloud" : "Enable read aloud"}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: enabled ? "var(--acc-bg)" : "var(--bg-elevated)",
              color: enabled ? "var(--acc-txt)" : "var(--txt-4)",
              border: `1px solid ${enabled ? "var(--acc)" : "var(--bdr)"}`,
            }}
          >
            {enabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{enabled ? "Read Aloud On" : "Read Aloud Off"}</span>
          </button>

          {/* Theme picker */}
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => setPickerOpen((v) => !v)}
              title="Change theme"
              className="p-2 rounded-lg transition-colors"
              style={{
                background: pickerOpen ? "var(--bg-elevated)" : "transparent",
                color: "var(--txt-3)",
                border: `1px solid ${pickerOpen ? "var(--bdr-hov)" : "var(--bdr)"}`,
              }}
            >
              <Palette className="w-4 h-4" />
            </button>

            {pickerOpen && (
              <div
                className="absolute right-0 top-full mt-2 rounded-2xl shadow-2xl border z-50"
                style={{
                  background: "var(--bg-nav)",
                  borderColor: "var(--bdr-hov)",
                  padding: "12px 14px 14px",
                  minWidth: 196,
                }}
              >
                {/* Header: label + active/hovered name */}
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--txt-4)", letterSpacing: "0.1em" }}>
                    Theme
                  </span>
                  <span className="text-xs font-semibold transition-all" style={{ color: "var(--txt-2)" }}>
                    {(hoveredTheme ?? THEMES.find((t) => t.key === theme))?.name}
                  </span>
                </div>

                {/* Swatch row */}
                <div className="flex items-center gap-2">
                  {THEMES.map((t) => {
                    const isActive = theme === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => { setTheme(t.key); setPickerOpen(false); }}
                        onMouseEnter={() => setHoveredTheme(t)}
                        onMouseLeave={() => setHoveredTheme(null)}
                        title={t.name}
                        className="transition-transform hover:scale-110"
                        style={{
                          width: 30,
                          height: 22,
                          borderRadius: 7,
                          overflow: "hidden",
                          display: "flex",
                          padding: 0,
                          border: "none",
                          cursor: "pointer",
                          outline: isActive ? `2.5px solid ${t.accent}` : `1.5px solid ${t.accent}30`,
                          outlineOffset: isActive ? 2 : 1,
                          boxShadow: isActive ? `0 0 8px ${t.accent}50` : "none",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{ flex: 2, background: t.bg }} />
                        <span style={{ flex: 1, background: t.mid }} />
                        <span style={{ width: 6, flexShrink: 0, background: t.accent }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Search overlay — position:fixed so it doesn't affect nav layout */}
      {searchOpen && (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center pt-20 px-4"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
        onClick={(e) => { if (e.target === e.currentTarget) closeSearch(); }}
      >
        <div
          ref={searchRef}
          className="w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden"
          style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
        >
          {/* Input row */}
          <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--bdr)" }}>
            <Search className="w-4 h-4 flex-shrink-0" style={{ color: "var(--txt-4)" }} />
            <input
              ref={searchInput}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search insights…"
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: "var(--txt-1)" }}
            />
            {searchLoading && (
              <span className="text-xs" style={{ color: "var(--txt-4)" }}>Searching…</span>
            )}
            <button onClick={closeSearch} style={{ color: "var(--txt-4)" }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filters */}
          <div className="px-3 py-2 border-b flex flex-col gap-2" style={{ borderColor: "var(--bdr)", background: "var(--bg-elevated)" }}>
            {/* Row 1: Domain chips */}
            <div className="flex flex-wrap gap-1.5">
              {DOMAINS.map((d) => {
                const c = getDomainColor(d);
                const active = filterDomain === d;
                return (
                  <button
                    key={d}
                    onClick={() => setFilterDomain(active ? "" : d)}
                    className={`text-xs px-2.5 py-1 rounded-full font-medium transition-all border ${active ? `${c.bg} ${c.text}` : ""}`}
                    style={active
                      ? { borderColor: "transparent" }
                      : { background: "var(--bg-surface)", color: "var(--txt-4)", borderColor: "var(--bdr)" }
                    }
                  >
                    {d.split(" & ")[0]}
                  </button>
                );
              })}
            </div>

            {/* Row 2: Podcast + Date range + Clear */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Podcast channel dropdown */}
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border outline-none flex-1 min-w-0"
                style={{ background: "var(--bg-surface)", color: filterSource ? "var(--txt-1)" : "var(--txt-4)", borderColor: filterSource ? "var(--acc)" : "var(--bdr)", maxWidth: "200px" }}
              >
                <option value="">All podcasts</option>
                {sourceOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              {/* Date range */}
              <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  title="From date"
                  className="text-xs px-2 py-1 rounded-lg border outline-none"
                  style={{ background: "var(--bg-surface)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
                />
                <span className="text-xs" style={{ color: "var(--txt-4)" }}>–</span>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  title="To date"
                  className="text-xs px-2 py-1 rounded-lg border outline-none"
                  style={{ background: "var(--bg-surface)", color: "var(--txt-3)", borderColor: "var(--bdr)" }}
                />
                {(filterDomain || filterFrom || filterTo || filterSource) && (
                  <button
                    onClick={() => { setFilterDomain(""); setFilterFrom(""); setFilterTo(""); setFilterSource(""); }}
                    className="text-xs px-2 py-1 rounded-lg border transition-colors"
                    style={{ background: "var(--bg-surface)", color: "var(--txt-4)", borderColor: "var(--bdr)" }}
                    title="Clear filters"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <ul className="max-h-96 overflow-y-auto divide-y" style={{ borderColor: "var(--bdr)" }}>
              {searchResults.map((r) => {
                const colors = getDomainColor(r.domain);
                return (
                  <li key={r.id}>
                    <button
                      onClick={() => handleResultClick(r)}
                      className="w-full text-left px-4 py-3 transition-colors"
                      style={{ color: "var(--txt-1)" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}
                        >
                          {r.domain}
                        </span>
                        <span className="text-xs" style={{ color: "var(--txt-4)" }}>{r.source_name}</span>
                        <span className="text-xs ml-auto" style={{ color: "var(--txt-4)" }}>{r.date}</span>
                      </div>
                      {r.episode_title && (
                        <p className="text-xs font-medium mb-0.5 truncate" style={{ color: "var(--txt-3)" }}>
                          {r.episode_title}
                        </p>
                      )}
                      <p className="text-xs line-clamp-2" style={{ color: "var(--txt-3)" }}>{r.summary}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {searchQuery.length >= 2 && !searchLoading && searchResults.length === 0 && (
            <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--txt-4)" }}>
              No insights found for &ldquo;{searchQuery}&rdquo;
            </p>
          )}

          {searchQuery.length < 2 && (
            <p className="px-4 py-4 text-xs" style={{ color: "var(--txt-4)" }}>
              Type at least 2 characters to search across all insight summaries, key points, quotes, and tags. Use the domain chips or date range above to narrow results.
            </p>
          )}
        </div>
      </div>
    )}
    </nav>
  );
}

