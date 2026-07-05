"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Volume2, VolumeX, Palette, Check, LogOut } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTTS } from "@/contexts/TTSContext";
import { useTheme, THEMES, type ThemeKey } from "@/contexts/ThemeContext";

export default function NavBar({ isAuthed }: { isAuthed: boolean }) {
  const { enabled, toggle } = useTTS();
  const { theme, setTheme } = useTheme();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  // Close picker on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    if (pickerOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [pickerOpen]);

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

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{ background: "var(--bg-nav)", borderColor: "var(--nav-bdr)" }}
    >
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-semibold transition-opacity hover:opacity-80" style={{ color: "var(--txt-1)" }}>
          <span className="text-lg">🎙</span>
          <span>Podcast Insights</span>
        </Link>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          {navLink("/", "Dashboard")}
          {navLink("/podcasts", "My Podcasts")}

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

          {/* Logout — only shown when authenticated on the podcasts page */}
          {isAuthed && pathname.startsWith("/podcasts") && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
              style={{ background: "var(--bg-elevated)", color: "var(--txt-3)", border: "1px solid var(--bdr)" }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          )}

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
                className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-2xl border p-2 z-50"
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
  meta: { key: ThemeKey; name: string; bg: string; accent: string };
  active: boolean;
  onSelect: (k: ThemeKey) => void;
}) {
  return (
    <button
      onClick={() => onSelect(meta.key)}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors text-left"
      style={{
        background: active ? "var(--bg-elevated)" : "transparent",
        color: "var(--txt-2)",
      }}
      onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-surface-hov)"; }}
      onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
    >
      {/* Swatch */}
      <span
        className="w-7 h-7 rounded-lg flex-shrink-0 flex items-center justify-center border"
        style={{ background: meta.bg, borderColor: meta.accent + "60" }}
      >
        <span
          className="w-3 h-3 rounded-full"
          style={{ background: meta.accent }}
        />
      </span>
      <span className="text-sm font-medium flex-1">{meta.name}</span>
      {active && <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--acc)" }} />}
    </button>
  );
}
