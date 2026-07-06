"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export type ThemeKey = "anthropic-light" | "midnight" | "aurora" | "dusk" | "forest";

export interface ThemeMeta {
  key: ThemeKey;
  name: string;
  bg: string;
  accent: string;
}

export const THEMES: ThemeMeta[] = [
  { key: "anthropic-light", name: "Light",           bg: "#FAF9F6", accent: "#C2410C" },
  { key: "midnight",        name: "Midnight",        bg: "#0A0D14", accent: "#6366F1" },
  { key: "aurora",          name: "Aurora",          bg: "#020B18", accent: "#06B6D4" },
  { key: "dusk",            name: "Dusk",            bg: "#0D0816", accent: "#A855F7" },
  { key: "forest",          name: "Forest",          bg: "#040D08", accent: "#10B981" },
];

const THEME_VARS: Record<ThemeKey, Record<string, string>> = {
  "anthropic-light": {
    "--bg-page": "#FAF9F6", "--bg-nav": "#FFFFFF", "--bg-surface": "#FFFFFF",
    "--bg-surface-hov": "#F7F5F1", "--bg-elevated": "#F0EDE8",
    "--bg-quote": "rgba(240,237,232,0.8)", "--bg-input": "#F5F2EE", "--bg-chip": "#F0EDE8",
    "--bdr": "#E2DDD6", "--bdr-hov": "#C5BDB2", "--bdr-strong": "#A89D91",
    "--txt-1": "#1C1917", "--txt-2": "#44403C", "--txt-3": "#78716C", "--txt-4": "#A8A29E",
    "--acc": "#C2410C", "--acc-bg": "#FFF7ED", "--acc-txt": "#C2410C", "--nav-bdr": "#E2DDD6",
    "--gold-bg": "#FEF9C3", "--gold-txt": "#713F12",
    "--d-tech-bg": "#EFF6FF", "--d-tech-txt": "#1D4ED8", "--d-tech-bdr": "#BFDBFE", "--d-tech-dot": "#3B82F6",
    "--d-biz-bg": "#ECFDF5",  "--d-biz-txt": "#065F46",  "--d-biz-bdr": "#A7F3D0",  "--d-biz-dot": "#10B981",
    "--d-hlth-bg": "#FDF2F8", "--d-hlth-txt": "#9D174D", "--d-hlth-bdr": "#FBCFE8", "--d-hlth-dot": "#EC4899",
    "--d-fin-bg": "#FFFBEB",  "--d-fin-txt": "#92400E",  "--d-fin-bdr": "#FDE68A",  "--d-fin-dot": "#F59E0B",
    "--d-lead-bg": "#F5F3FF", "--d-lead-txt": "#5B21B6", "--d-lead-bdr": "#DDD6FE", "--d-lead-dot": "#7C3AED",
    "--d-soc-bg": "#FFF1F2",  "--d-soc-txt": "#9F1239",  "--d-soc-bdr": "#FECDD3",  "--d-soc-dot": "#F43F5E",
    "--d-oth-bg": "#F8FAFC",  "--d-oth-txt": "#475569",  "--d-oth-bdr": "#E2E8F0",  "--d-oth-dot": "#64748B",
  },
  "midnight": {
    "--bg-page": "#0A0D14", "--bg-nav": "#0D1117", "--bg-surface": "#0F172A",
    "--bg-surface-hov": "#1a2540", "--bg-elevated": "#1E293B",
    "--bg-quote": "rgba(30,41,59,0.55)", "--bg-input": "#1E293B", "--bg-chip": "#1E293B",
    "--bdr": "#1E293B", "--bdr-hov": "#334155", "--bdr-strong": "#475569",
    "--txt-1": "#F1F5F9", "--txt-2": "#CBD5E1", "--txt-3": "#94A3B8", "--txt-4": "#64748B",
    "--acc": "#6366F1", "--acc-bg": "#1E1B4B", "--acc-txt": "#A5B4FC", "--nav-bdr": "#1E293B",
    "--gold-bg": "#713F12", "--gold-txt": "#FEF08A",
    "--d-tech-bg": "#172554", "--d-tech-txt": "#93C5FD", "--d-tech-bdr": "#1E40AF", "--d-tech-dot": "#60A5FA",
    "--d-biz-bg": "#022C22",  "--d-biz-txt": "#6EE7B7",  "--d-biz-bdr": "#065F46",  "--d-biz-dot": "#34D399",
    "--d-hlth-bg": "#500724", "--d-hlth-txt": "#FBCFE8", "--d-hlth-bdr": "#9D174D", "--d-hlth-dot": "#F472B6",
    "--d-fin-bg": "#451A03",  "--d-fin-txt": "#FCD34D",  "--d-fin-bdr": "#92400E",  "--d-fin-dot": "#FBBF24",
    "--d-lead-bg": "#2E1065", "--d-lead-txt": "#C4B5FD", "--d-lead-bdr": "#5B21B6", "--d-lead-dot": "#A78BFA",
    "--d-soc-bg": "#4C0519",  "--d-soc-txt": "#FECDD3",  "--d-soc-bdr": "#9F1239",  "--d-soc-dot": "#FB7185",
    "--d-oth-bg": "#0F172A",  "--d-oth-txt": "#CBD5E1",  "--d-oth-bdr": "#334155",  "--d-oth-dot": "#94A3B8",
  },
  "aurora": {
    "--bg-page": "#020B18", "--bg-nav": "#030F22", "--bg-surface": "#06182A",
    "--bg-surface-hov": "#0B2540", "--bg-elevated": "#0D2D4E",
    "--bg-quote": "rgba(13,45,78,0.6)", "--bg-input": "#0B2540", "--bg-chip": "#0B2540",
    "--bdr": "#0D2D50", "--bdr-hov": "#1A4A72", "--bdr-strong": "#2A6090",
    "--txt-1": "#E0F2FE", "--txt-2": "#BAE6FD", "--txt-3": "#7DD3FC", "--txt-4": "#38BDF8",
    "--acc": "#06B6D4", "--acc-bg": "#083344", "--acc-txt": "#67E8F9", "--nav-bdr": "#0D2D50",
    "--gold-bg": "#713F12", "--gold-txt": "#FEF08A",
    "--d-tech-bg": "#0C2A5C", "--d-tech-txt": "#93C5FD", "--d-tech-bdr": "#1E4D8C", "--d-tech-dot": "#60A5FA",
    "--d-biz-bg": "#022C22",  "--d-biz-txt": "#6EE7B7",  "--d-biz-bdr": "#065F46",  "--d-biz-dot": "#34D399",
    "--d-hlth-bg": "#3D0520", "--d-hlth-txt": "#FBCFE8", "--d-hlth-bdr": "#7D1340", "--d-hlth-dot": "#F472B6",
    "--d-fin-bg": "#3D1500",  "--d-fin-txt": "#FCD34D",  "--d-fin-bdr": "#7A3200",  "--d-fin-dot": "#FBBF24",
    "--d-lead-bg": "#1E0A4A", "--d-lead-txt": "#C4B5FD", "--d-lead-bdr": "#4A1A9A", "--d-lead-dot": "#A78BFA",
    "--d-soc-bg": "#3D0515",  "--d-soc-txt": "#FECDD3",  "--d-soc-bdr": "#800E30",  "--d-soc-dot": "#FB7185",
    "--d-oth-bg": "#06182A",  "--d-oth-txt": "#BAE6FD",  "--d-oth-bdr": "#1A4A72",  "--d-oth-dot": "#7DD3FC",
  },
  "dusk": {
    "--bg-page": "#0D0816", "--bg-nav": "#100B1C", "--bg-surface": "#160F26",
    "--bg-surface-hov": "#1E163A", "--bg-elevated": "#241A42",
    "--bg-quote": "rgba(36,26,66,0.6)", "--bg-input": "#1E163A", "--bg-chip": "#1E163A",
    "--bdr": "#2A1E4A", "--bdr-hov": "#3D2C6E", "--bdr-strong": "#553A92",
    "--txt-1": "#F3E8FF", "--txt-2": "#E9D5FF", "--txt-3": "#C4B5FD", "--txt-4": "#A78BFA",
    "--acc": "#A855F7", "--acc-bg": "#2E1065", "--acc-txt": "#D8B4FE", "--nav-bdr": "#2A1E4A",
    "--gold-bg": "#713F12", "--gold-txt": "#FEF08A",
    "--d-tech-bg": "#1A2060", "--d-tech-txt": "#93C5FD", "--d-tech-bdr": "#2A3A9A", "--d-tech-dot": "#60A5FA",
    "--d-biz-bg": "#081C18",  "--d-biz-txt": "#6EE7B7",  "--d-biz-bdr": "#0C3A30",  "--d-biz-dot": "#34D399",
    "--d-hlth-bg": "#3D0A2A", "--d-hlth-txt": "#FBCFE8", "--d-hlth-bdr": "#7D1550", "--d-hlth-dot": "#F472B6",
    "--d-fin-bg": "#3D1800",  "--d-fin-txt": "#FCD34D",  "--d-fin-bdr": "#7A3500",  "--d-fin-dot": "#FBBF24",
    "--d-lead-bg": "#2E1065", "--d-lead-txt": "#C4B5FD", "--d-lead-bdr": "#5B21B6", "--d-lead-dot": "#A78BFA",
    "--d-soc-bg": "#3D0525",  "--d-soc-txt": "#FECDD3",  "--d-soc-bdr": "#800E40",  "--d-soc-dot": "#FB7185",
    "--d-oth-bg": "#160F26",  "--d-oth-txt": "#E9D5FF",  "--d-oth-bdr": "#3D2C6E",  "--d-oth-dot": "#C4B5FD",
  },
  "forest": {
    "--bg-page": "#040D08", "--bg-nav": "#060F0A", "--bg-surface": "#09150F",
    "--bg-surface-hov": "#0F2218", "--bg-elevated": "#122A1C",
    "--bg-quote": "rgba(18,42,28,0.65)", "--bg-input": "#0F2218", "--bg-chip": "#0F2218",
    "--bdr": "#122A1C", "--bdr-hov": "#1C4A2C", "--bdr-strong": "#256338",
    "--txt-1": "#ECFDF5", "--txt-2": "#D1FAE5", "--txt-3": "#6EE7B7", "--txt-4": "#34D399",
    "--acc": "#10B981", "--acc-bg": "#022C22", "--acc-txt": "#6EE7B7", "--nav-bdr": "#122A1C",
    "--gold-bg": "#713F12", "--gold-txt": "#FEF08A",
    "--d-tech-bg": "#0F1E4A", "--d-tech-txt": "#93C5FD", "--d-tech-bdr": "#1E3A8A", "--d-tech-dot": "#60A5FA",
    "--d-biz-bg": "#022C22",  "--d-biz-txt": "#6EE7B7",  "--d-biz-bdr": "#065F46",  "--d-biz-dot": "#34D399",
    "--d-hlth-bg": "#3D0520", "--d-hlth-txt": "#FBCFE8", "--d-hlth-bdr": "#7D1340", "--d-hlth-dot": "#F472B6",
    "--d-fin-bg": "#3D1500",  "--d-fin-txt": "#FCD34D",  "--d-fin-bdr": "#7A3200",  "--d-fin-dot": "#FBBF24",
    "--d-lead-bg": "#1E0A4A", "--d-lead-txt": "#C4B5FD", "--d-lead-bdr": "#4A1A9A", "--d-lead-dot": "#A78BFA",
    "--d-soc-bg": "#3D0515",  "--d-soc-txt": "#FECDD3",  "--d-soc-bdr": "#800E30",  "--d-soc-dot": "#FB7185",
    "--d-oth-bg": "#09150F",  "--d-oth-txt": "#D1FAE5",  "--d-oth-bdr": "#1C4A2C",  "--d-oth-dot": "#6EE7B7",
  },
};

function applyTheme(key: ThemeKey) {
  const vars = THEME_VARS[key];
  const root = document.documentElement;
  for (const [prop, val] of Object.entries(vars)) {
    root.style.setProperty(prop, val);
  }
  root.setAttribute("data-theme", key);
}

interface ThemeContextValue {
  theme: ThemeKey;
  setTheme: (t: ThemeKey) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "anthropic-light",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeKey>("anthropic-light");

  useEffect(() => {
    // Apply default immediately, then override from localStorage
    applyTheme("anthropic-light");
    const saved = localStorage.getItem("theme") as ThemeKey | null;
    if (saved && THEME_VARS[saved]) {
      applyTheme(saved);
      setThemeState(saved);
    }
  }, []);

  const setTheme = useCallback((t: ThemeKey) => {
    setThemeState(t);
    localStorage.setItem("theme", t);
    applyTheme(t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
