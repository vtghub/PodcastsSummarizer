"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Volume2, VolumeX, Palette, Check, UserCircle, LogOut, User } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTTS } from "@/contexts/TTSContext";
import { useTheme, THEMES, type ThemeKey } from "@/contexts/ThemeContext";

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
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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
                className="absolute right-0 top-full mt-2 w-64 rounded-xl shadow-2xl border p-2 z-50"
                style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)" }}
              >
                <p className="text-xs font-semibold px-2 pb-2 pt-1" style={{ color: "var(--txt-4)" }}>
                  THEME
                </p>
                {THEMES.map((t) => (
                  <ThemeOption
                    key={t.key}
                    meta={t}
                    active={theme === t.key}
                    onSelect={(k) => { setTheme(k); setPickerOpen(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function ThemeOption({
  meta, active, onSelect,
}: {
  meta: { key: ThemeKey; name: string; description: string; bg: string; accent: string; mid: string };
  active: boolean;
  onSelect: (k: ThemeKey) => void;
}) {
  return (
    <button
      onClick={() => onSelect(meta.key)}
      className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl transition-colors text-left"
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        color: "var(--txt-2)",
        outline: active ? `1.5px solid ${meta.accent}55` : "none",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hov)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Two-tone swatch: left = background, right strip = accent */}
      <span
        className="flex-shrink-0 rounded-lg overflow-hidden border"
        style={{ width: 40, height: 28, borderColor: meta.accent + "40", display: "flex" }}
      >
        <span style={{ flex: 2, background: meta.bg }} />
        <span style={{ flex: 1, background: meta.mid }} />
        <span style={{ width: 8, background: meta.accent }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-tight" style={{ color: "var(--txt-1)" }}>
          {meta.name}
        </span>
        <span className="block text-xs leading-tight mt-0.5" style={{ color: "var(--txt-4)" }}>
          {meta.description}
        </span>
      </span>
      {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: meta.accent }} />}
    </button>
  );
}
