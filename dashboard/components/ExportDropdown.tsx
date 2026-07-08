"use client";

import { useState, useRef, useEffect } from "react";

const FORMATS = [
  { label: "CSV",  value: "csv",  description: "Spreadsheet" },
  { label: "JSON", value: "json", description: "Raw data"    },
] as const;

export default function ExportDropdown({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleSelect(fmt: string) {
    setOpen(false);
    const url = `/api/insights/export?format=${fmt}&date=${date}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-${date}.${fmt}`;
    a.click();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-opacity hover:opacity-80"
        style={{ background: "var(--bg-elevated)", color: "var(--txt-4)", borderColor: "var(--bdr)" }}
        title="Export insights"
      >
        ↓ Export
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)", minWidth: 148 }}
        >
          {FORMATS.map(({ label, value, description }) => (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              className="w-full flex items-center justify-between gap-4 px-3 py-2 text-xs text-left transition-colors"
              style={{ color: "var(--txt-2)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <span className="font-medium">{label}</span>
              <span style={{ color: "var(--txt-4)" }}>{description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
