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

// Exact colours from lib/email.ts
const DOMAIN_HEX: Record<string, string> = {
  "Technology & AI":           "#3b82f6",
  "Business & Startups":       "#10b981",
  "Health & Science":          "#ec4899",
  "Finance & Investing":       "#f59e0b",
  "Leadership & Productivity": "#8b5cf6",
  "Society & Culture":         "#ef4444",
  "Other":                     "#6b7280",
};

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

async function generatePdf(date: string) {
  const { jsPDF } = await import("jspdf");
  const res = await fetch(`/api/insights/export?format=json&date=${date}`);
  if (!res.ok) throw new Error("Failed to fetch insights");
  const { insights }: { date: string; count: number; insights: JsonInsight[] } = await res.json();

  // Group by domain (preserving encounter order, matching email renderer)
  const byDomain: Record<string, JsonInsight[]> = {};
  for (const ins of insights) {
    (byDomain[ins.domain] ??= []).push(ins);
  }

  const doc   = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mg    = 48;               // page margin
  const cW    = pageW - mg * 2;  // content width
  const footerY = pageH - 24;
  let y = mg;
  let pageNum = 1;

  // ── palette (mirrors email renderer) ───────────────────────────────────────
  const C = {
    pageBg:    [249, 250, 251] as [number,number,number],  // #f9fafb
    cardBg:    [255, 255, 255] as [number,number,number],  // #fff
    cardBdr:   [229, 231, 235] as [number,number,number],  // #e5e7eb
    textHead:  [ 17,  24,  39] as [number,number,number],  // #111827
    textBody:  [ 55,  65,  81] as [number,number,number],  // #374151
    textMuted: [107, 114, 128] as [number,number,number],  // #6b7280
    textSrc:   [156, 163, 175] as [number,number,number],  // #9ca3af
    textQuote: [ 85,  85,  85] as [number,number,number],  // #555
  };

  // ── page helpers ───────────────────────────────────────────────────────────

  function drawPageBg() {
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, pageW, pageH, "F");
  }

  function drawFooter() {
    doc.setFontSize(8);
    doc.setTextColor(...C.textSrc);
    doc.setFont("helvetica", "normal");
    doc.text(`Podcast Insights  ·  ${date}`, mg, footerY);
    doc.text(`${pageNum}`, pageW - mg, footerY, { align: "right" });
  }

  function newPage() {
    drawFooter();
    doc.addPage();
    pageNum++;
    y = mg;
    drawPageBg();
  }

  function ensureSpace(need: number) {
    if (y + need > footerY - 16) newPage();
  }

  // Lay out wrapped text; returns total height consumed
  function addText(
    str: string,
    size: number,
    color: [number,number,number],
    opts: { bold?: boolean; maxW?: number; x?: number } = {}
  ): number {
    const { bold = false, maxW = cW, x = mg } = opts;
    doc.setFontSize(size);
    doc.setTextColor(...color);
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(str, maxW) as string[];
    const lh = size * 1.5;
    ensureSpace(lines.length * lh);
    doc.text(lines, x, y);
    y += lines.length * lh;
    return lines.length * lh;
  }

  // ── Page 1 setup ───────────────────────────────────────────────────────────
  drawPageBg();

  // Header — mirrors email <h1> + subtitle
  y = mg + 4;
  addText("Podcast Insights", 22, C.textHead, { bold: true });
  y += 2;
  addText(date, 12, C.textMuted);
  y += 16;

  // Thin separator
  doc.setDrawColor(...C.cardBdr);
  doc.setLineWidth(0.75);
  doc.line(mg, y, pageW - mg, y);
  y += 20;

  // ── Domain sections ────────────────────────────────────────────────────────
  for (const [domain, domainInsights] of Object.entries(byDomain)) {
    const [r, g, b] = hexToRgb(DOMAIN_HEX[domain] ?? "#6b7280");

    ensureSpace(36);

    // Domain badge — colored pill (mirrors email inline-block colored div)
    const badgeLabel = domain.toUpperCase();
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const badgeW = doc.getTextWidth(badgeLabel) + 20;
    const badgeH = 18;
    doc.setFillColor(r, g, b);
    doc.roundedRect(mg, y, badgeW, badgeH, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(badgeLabel, mg + 10, y + 12.5);
    y += badgeH + 14;

    // ── Insight cards ────────────────────────────────────────────────────────
    for (const ins of domainInsights) {
      ensureSpace(90);

      const pad   = 14;          // inner card padding
      const cardX = mg - pad;
      const cardW = cW + pad * 2;

      // ── Measure card height before drawing anything ────────────────────────
      // We need to know total height up front so we can draw the white card
      // background BEFORE the text (so text renders on top of it).
      function measureWrapped(str: string, size: number, maxW: number): number {
        doc.setFontSize(size);
        const lines = doc.splitTextToSize(str, maxW) as string[];
        return lines.length * size * 1.5;
      }

      let est = pad * 2;
      const srcParts = [ins.source, ins.episode].filter(Boolean);
      if (srcParts.length) est += measureWrapped(srcParts.join(" · "), 9, cW) + 4;
      est += measureWrapped(ins.summary, 10.5, cW) + 10;
      if (ins.key_points.length) {
        est += 10 * 1.5 + 4; // header
        for (const p of ins.key_points) est += measureWrapped(p, 10, cW - 16);
        est += 8;
      }
      if (ins.key_quotes.length) {
        for (const q of ins.key_quotes) est += measureWrapped(`"${q}"`, 10, cW - 20) + 12;
        est += 6;
      }
      if (ins.action_items.length) {
        est += 10 * 1.5 + 4;
        for (const a of ins.action_items) est += measureWrapped(a, 10, cW - 16);
        est += 6;
      }

      // If card won't fit on remaining page, start a new page
      if (y + est > footerY - 16) newPage();

      const cardStartY = y - pad + 4;

      // Draw white card background + border FIRST
      doc.setFillColor(...C.cardBg);
      doc.setDrawColor(...C.cardBdr);
      doc.setLineWidth(0.5);
      doc.roundedRect(cardX, cardStartY, cardW, est, 5, 5, "FD");

      // ── Now draw text content ──────────────────────────────────────────────

      // Source line
      if (srcParts.length) {
        addText(srcParts.join(" · "), 9, C.textSrc);
        y += 2;
      }

      // Summary
      addText(ins.summary, 10.5, C.textBody);
      y += 8;

      // Key Points
      if (ins.key_points.length) {
        addText("Key Points", 10, C.textHead, { bold: true });
        y += 3;
        for (const pt of ins.key_points) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textBody);
          doc.text("•", mg + 4, y);
          const lines = doc.splitTextToSize(pt, cW - 16) as string[];
          doc.text(lines, mg + 14, y);
          y += lines.length * 10 * 1.5;
        }
        y += 8;
      }

      // Key Quotes — blockquote with colored left bar
      if (ins.key_quotes.length) {
        for (const q of ins.key_quotes) {
          const qLines = doc.splitTextToSize(`"${q}"`, cW - 18) as string[];
          const qH = qLines.length * 10 * 1.5 + 10;
          // Colored 3pt left bar
          doc.setFillColor(r, g, b);
          doc.rect(mg + 2, y - 11, 3, qH, "F");
          doc.setFontSize(10);
          doc.setFont("helvetica", "italic");
          doc.setTextColor(...C.textQuote);
          doc.text(qLines, mg + 14, y);
          y += qH;
        }
        y += 4;
      }

      // Action Items
      if (ins.action_items.length) {
        addText("Action Items", 10, C.textHead, { bold: true });
        y += 3;
        for (const act of ins.action_items) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "normal");
          doc.setTextColor(...C.textBody);
          doc.text("→", mg + 4, y);
          const lines = doc.splitTextToSize(act, cW - 16) as string[];
          doc.text(lines, mg + 14, y);
          y += lines.length * 10 * 1.5;
        }
        y += 4;
      }

      y = cardStartY + est + 12;
    }

    y += 8;
  }

  drawFooter();
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
