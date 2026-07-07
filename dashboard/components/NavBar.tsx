"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Volume2, VolumeX, Palette, UserCircle, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTTS } from "@/contexts/TTSContext";
import { useTheme, THEMES } from "@/contexts/ThemeContext";

export default function NavBar({
  userEmail,
  displayName,
}: {
  userEmail?: string | null;
  displayName?: string | null;
}) {
  const { enabled, toggle } = useTTS();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [hoveredTheme, setHoveredTheme] = useState<typeof THEMES[0] | null>(null);
  const pickerRef  = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
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
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="hidden sm:inline">{navLink("/dashboard", "Dashboard")}</span>
          {navLink("/podcasts", "My Podcasts")}

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
    </nav>
  );
}

