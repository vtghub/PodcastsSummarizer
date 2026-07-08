"use client";

import { useState, useRef, useEffect } from "react";

const FORMATS = [
  { label: "CSV",  value: "csv",  description: "Spreadsheet" },
  { label: "JSON", value: "json", description: "Raw data"    },
  { label: "PDF",  value: "pdf",  description: "Download"    },
] as const;

interface JsonInsight {
  id: string;
  domain: string;
  source: string | null;
  episode: string | null;
  summary: string;
  key_points: string[];
  key_quotes: string[];
  action_items: string[];
  tags: string[];
}

async function generatePdf(date: string) {
  // Dynamic import so jsPDF is never bundled into the server chunk
  const { jsPDF } = await import("jspdf");
  const res = await fetch(`/api/insights/export?format=json&date=${date}`);
  if (!res.ok) throw new Error("Failed to fetch insights");
  const { insights }: { date: string; count: number; insights: JsonInsight[] } = await res.json();

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  let y = margin;

  function ensureSpace(needed: number) {
    if (y + needed > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  }

  function addText(text: string, size: number, color: [number, number, number], bold = false) {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, contentW);
    ensureSpace(lines.length * size * 1.4);
    doc.text(lines, margin, y);
    y += lines.length * size * 1.4;
  }

  // Title
  addText(`Podcast Insights — ${date}`, 18, [26, 26, 26], true);
  addText(`${insights.length} insight${insights.length !== 1 ? "s" : ""}`, 10, [136, 136, 136]);
  y += 12;

  insights.forEach((ins, i) => {
    ensureSpace(60);

    // Separator line (not before first)
    if (i > 0) {
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
    }

    // Meta
    const meta = [ins.domain, ins.source, ins.episode].filter(Boolean).join(" · ");
    addText(meta, 8, [136, 136, 136]);
    y += 2;

    // Summary
    addText(ins.summary, 10, [26, 26, 26]);
    y += 4;

    const section = (title: string, items: string[], prefix = "") => {
      if (!items.length) return;
      ensureSpace(24);
      addText(title, 8, [85, 85, 85], true);
      y += 2;
      items.forEach((item) => {
        const text = prefix ? `${prefix} ${item}` : item;
        addText(text, 9, [51, 51, 51]);
      });
      y += 4;
    };

    section("KEY POINTS", ins.key_points, "•");
    section("KEY QUOTES", ins.key_quotes.map((q) => `"${q}"`));
    section("ACTION ITEMS", ins.action_items, "→");

    if (ins.tags.length) {
      addText(ins.tags.map((t) => `#${t}`).join("  "), 8, [119, 119, 119]);
    }

    y += 8;
  });

  doc.save(`insights-${date}.pdf`);
}

export default function ExportDropdown({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function handleSelect(fmt: string) {
    setOpen(false);
    if (fmt === "pdf") {
      setLoading("pdf");
      try {
        await generatePdf(date);
      } finally {
        setLoading(null);
      }
      return;
    }
    const url = `/api/insights/export?format=${fmt}&date=${date}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-${date}.${fmt}`;
    a.click();
  }

  const busy = loading !== null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => !busy && setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-opacity hover:opacity-80"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--txt-4)",
          borderColor: "var(--bdr)",
          opacity: busy ? 0.6 : 1,
          cursor: busy ? "default" : "pointer",
        }}
        title="Export insights"
      >
        {busy ? "Generating…" : "↓ Export"}
        {!busy && <span style={{ opacity: 0.5 }}>▾</span>}
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
