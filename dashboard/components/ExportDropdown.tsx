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

// Domain accent colours (RGB) — mirror the app's CSS token palette
const DOMAIN_COLORS: Record<string, [number, number, number]> = {
  "Technology & AI":           [99,  102, 241],
  "Business & Startups":       [245, 158,  11],
  "Health & Science":          [16,  185, 129],
  "Finance & Investing":       [59,  130, 246],
  "Leadership & Productivity": [168,  85, 247],
  "Society & Culture":         [236,  72, 153],
};
function domainColor(domain: string): [number, number, number] {
  return DOMAIN_COLORS[domain] ?? [107, 114, 128];
}

async function generatePdf(date: string) {
  const { jsPDF } = await import("jspdf");
  const res = await fetch(`/api/insights/export?format=json&date=${date}`);
  if (!res.ok) throw new Error("Failed to fetch insights");
  const { insights }: { date: string; count: number; insights: JsonInsight[] } = await res.json();

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 50;
  const contentW = pageW - margin * 2;
  let y = margin;
  let pageNum = 1;

  // ── helpers ────────────────────────────────────────────────────────────────

  function addPageFooter() {
    doc.setFontSize(8);
    doc.setTextColor(170, 170, 170);
    doc.setFont("helvetica", "normal");
    doc.text(`Podcast Insights · ${date}`, margin, pageH - 24);
    doc.text(`Page ${pageNum}`, pageW - margin, pageH - 24, { align: "right" });
  }

  function newPage() {
    addPageFooter();
    doc.addPage();
    pageNum += 1;
    y = margin;
  }

  function ensureSpace(needed: number) {
    if (y + needed > pageH - 48) newPage();
  }

  function text(
    str: string,
    size: number,
    color: [number, number, number],
    opts: { bold?: boolean; maxW?: number; align?: "left" | "right" | "center" } = {}
  ) {
    const { bold = false, maxW = contentW, align = "left" } = opts;
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(str, maxW);
    const lineH = size * 1.45;
    ensureSpace(lines.length * lineH);
    const x = align === "right" ? pageW - margin : align === "center" ? pageW / 2 : margin;
    doc.text(lines, x, y, { align });
    y += lines.length * lineH;
    return lines.length * lineH;
  }

  function hRule(color: [number, number, number] = [230, 230, 230], weight = 0.5) {
    doc.setDrawColor(...color);
    doc.setLineWidth(weight);
    doc.line(margin, y, pageW - margin, y);
  }

  // ── Cover header ───────────────────────────────────────────────────────────

  // Accent bar at top
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 0, pageW, 6, "F");

  y = 36;
  text("Podcast Insights", 22, [26, 26, 26], { bold: true });
  y += 2;
  text(date, 11, [100, 100, 100]);
  y += 2;
  text(`${insights.length} insight${insights.length !== 1 ? "s" : ""}`, 9, [160, 160, 160]);
  y += 10;
  hRule([200, 200, 200], 0.75);
  y += 18;

  // ── Insights ───────────────────────────────────────────────────────────────

  insights.forEach((ins) => {
    // Estimate card height to avoid splitting a card awkwardly across pages
    ensureSpace(80);

    const [r, g, b] = domainColor(ins.domain);

    // Card background
    const cardX = margin - 10;
    const cardStartY = y - 8;
    const cardW = contentW + 20;

    // Domain badge pill
    doc.setFillColor(r, g, b, 0.12);  // light tint background
    doc.roundedRect(cardX, cardStartY, cardW, 18, 3, 3, "F");
    doc.setFillColor(r, g, b);
    doc.roundedRect(cardX, cardStartY, 4, 18, 1, 1, "F");  // left accent strip

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(r, g, b);
    doc.text(ins.domain.toUpperCase(), margin + 4, y + 5);

    // Source · Episode (right-aligned on same row)
    const meta = [ins.source, ins.episode].filter(Boolean).join(" · ");
    if (meta) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(140, 140, 140);
      doc.setFontSize(7.5);
      doc.text(meta, pageW - margin - 4, y + 5, { align: "right", maxWidth: contentW * 0.6 });
    }
    y += 20;

    // Summary
    text(ins.summary, 10, [30, 30, 30]);
    y += 5;

    // Section helper
    const section = (label: string, items: string[], bullet: string) => {
      if (!items.length) return;
      ensureSpace(20);
      text(label, 7.5, [120, 120, 120], { bold: true });
      y += 1;
      items.forEach((item) => {
        ensureSpace(14);
        // Bullet
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(r, g, b);
        doc.text(bullet, margin + 2, y);
        // Item text
        doc.setTextColor(55, 55, 55);
        const lines = doc.splitTextToSize(item, contentW - 14);
        doc.text(lines, margin + 13, y);
        y += lines.length * 9 * 1.4;
      });
      y += 4;
    };

    section("KEY POINTS", ins.key_points, "▸");
    section("KEY QUOTES", ins.key_quotes.map((q) => `"${q}"`), "❝");
    section("ACTION ITEMS", ins.action_items, "→");

    // Tags
    if (ins.tags.length) {
      ensureSpace(14);
      text(ins.tags.map((t) => `#${t}`).join("  "), 7.5, [170, 170, 170]);
    }

    y += 6;
    hRule([235, 235, 235]);
    y += 14;
  });

  addPageFooter();
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
