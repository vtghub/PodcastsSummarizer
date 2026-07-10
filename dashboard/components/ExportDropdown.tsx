"use client";

import { useState, useRef, useEffect } from "react";

const FORMATS = [
  { label: "PDF",   value: "pdf",   description: "Download"   },
  { label: "Excel", value: "excel", description: ".xlsx file" },
  { label: "Word",  value: "word",  description: ".docx file" },
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

  const byDomain: Record<string, JsonInsight[]> = {};
  for (const ins of insights) (byDomain[ins.domain] ??= []).push(ins);

  const doc     = new jsPDF({ unit: "pt", format: "letter" });
  const pageW   = doc.internal.pageSize.getWidth();
  const pageH   = doc.internal.pageSize.getHeight();
  const MG      = 48;              // page margin (left/right)
  const CW      = pageW - MG * 2; // usable content width
  const FOOTER  = pageH - 32;     // y of footer line
  let   y       = MG;
  let   pageNum = 1;

  // ── All spacing in one place — tweak here only ─────────────────────────────
  const S = {
    LH:           1.55,  // line-height multiplier (all text)
    cardPadX:     16,    // horizontal padding inside card
    cardPadTop:   14,    // top padding inside card
    cardPadBot:   14,    // bottom padding inside card
    afterSrc:      6,    // source line → summary
    afterSummary: 12,    // summary → first section (or end of card)
    afterSecHdr:   5,    // section header → first item
    afterItem:     2,    // between list items (added after each line block)
    afterSection: 10,    // after last item in a section → next section (or end)
    quoteBarOff:  10,    // colored bar offset above quote baseline
    afterQuote:    8,    // between consecutive quotes
    betweenCards: 14,    // gap between cards in same domain
    badgePadX:    10,    // horizontal padding inside badge pill
    badgeH:       20,    // badge pill height
    afterBadge:   12,    // badge → first card
    betweenDomains: 24,  // last card of domain → next domain badge
  };

  // ── Colour palette (exact values from lib/email.ts) ────────────────────────
  const C = {
    pageBg:   [249, 250, 251] as [number,number,number],
    cardBg:   [255, 255, 255] as [number,number,number],
    cardBdr:  [229, 231, 235] as [number,number,number],
    head:     [ 17,  24,  39] as [number,number,number],
    body:     [ 55,  65,  81] as [number,number,number],
    muted:    [107, 114, 128] as [number,number,number],
    src:      [156, 163, 175] as [number,number,number],
    quote:    [ 85,  85,  85] as [number,number,number],
  };

  // ── Primitives ─────────────────────────────────────────────────────────────

  function lh(size: number) { return size * S.LH; }

  // Split text into lines using the doc's current font/size
  function wrap(text: string, maxW: number): string[] {
    return doc.splitTextToSize(text, maxW) as string[];
  }

  // Height of a block of wrapped text at given size
  function blockH(text: string, size: number, maxW: number): number {
    doc.setFontSize(size);
    return wrap(text, maxW).length * lh(size);
  }

  function drawPageBg() {
    doc.setFillColor(...C.pageBg);
    doc.rect(0, 0, pageW, pageH, "F");
  }

  function drawFooter() {
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...C.src);
    doc.text(`Podcast Insights  ·  ${date}`, MG, FOOTER);
    doc.text(`${pageNum}`, pageW - MG, FOOTER, { align: "right" });
  }

  function newPage() {
    drawFooter();
    doc.addPage();
    pageNum++;
    y = MG;
    drawPageBg();
  }

  // Render wrapped text at current y; advance y by the text block height
  function putText(
    text: string,
    size: number,
    color: [number,number,number],
    x = MG,
    maxW = CW,
    style: "normal" | "bold" | "italic" = "normal"
  ) {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(...color);
    const lines = wrap(text, maxW);
    doc.text(lines, x, y);
    y += lines.length * lh(size);
  }

  // ── Measure a complete card (must mirror renderCard exactly) ───────────────
  function measureCard(ins: JsonInsight): number {
    const iW  = CW - S.cardPadX * 2;   // text width inside card
    const blW = iW - 14;               // bullet text width

    let h = S.cardPadTop;

    const src = [ins.source, ins.episode].filter(Boolean).join(" · ");
    if (src) h += blockH(src, 9, iW) + S.afterSrc;

    h += blockH(ins.summary, 10.5, iW) + S.afterSummary;

    if (ins.key_points.length) {
      h += blockH("Key Points", 10, iW) + S.afterSecHdr;
      for (const p of ins.key_points) h += blockH(p, 10, blW) + S.afterItem;
      h += S.afterSection;
    }

    if (ins.key_quotes.length) {
      for (const q of ins.key_quotes) h += blockH(`"${q}"`, 10, blW) + S.afterQuote;
      h += S.afterSection;
    }

    if (ins.action_items.length) {
      h += blockH("Action Items", 10, iW) + S.afterSecHdr;
      for (const a of ins.action_items) h += blockH(a, 10, blW) + S.afterItem;
      h += S.afterSection;
    }

    h += S.cardPadBot;
    return h;
  }

  // ── Render a card at the current y (card bg already drawn) ────────────────
  function renderCardContent(ins: JsonInsight, domainRgb: [number,number,number]) {
    const [r, g, b] = domainRgb;
    const cx  = MG + S.cardPadX;     // text x inside card
    const iW  = CW - S.cardPadX * 2; // text width inside card
    const blW = iW - 14;             // bullet text width

    const src = [ins.source, ins.episode].filter(Boolean).join(" · ");
    if (src) {
      putText(src, 9, C.src, cx, iW);
      y += S.afterSrc;
    }

    putText(ins.summary, 10.5, C.body, cx, iW);
    y += S.afterSummary;

    if (ins.key_points.length) {
      putText("Key Points", 10, C.head, cx, iW, "bold");
      y += S.afterSecHdr;
      for (const pt of ins.key_points) {
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
        doc.text("•", cx, y);
        const lines = wrap(pt, blW);
        doc.text(lines, cx + 10, y);
        y += lines.length * lh(10) + S.afterItem;
      }
      y += S.afterSection;
    }

    if (ins.key_quotes.length) {
      for (const q of ins.key_quotes) {
        const lines = wrap(`"${q}"`, blW);
        const barH  = lines.length * lh(10) + 4;
        doc.setFillColor(r, g, b);
        doc.rect(cx, y - S.quoteBarOff, 3, barH, "F");
        doc.setFontSize(10); doc.setFont("helvetica", "italic"); doc.setTextColor(...C.quote);
        doc.text(lines, cx + 10, y);
        y += lines.length * lh(10) + S.afterQuote;
      }
      y += S.afterSection;
    }

    if (ins.action_items.length) {
      putText("Action Items", 10, C.head, cx, iW, "bold");
      y += S.afterSecHdr;
      for (const act of ins.action_items) {
        doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(...C.body);
        doc.text("→", cx, y);
        const lines = wrap(act, blW);
        doc.text(lines, cx + 10, y);
        y += lines.length * lh(10) + S.afterItem;
      }
      y += S.afterSection;
    }
  }

  // ── Page 1 ─────────────────────────────────────────────────────────────────
  drawPageBg();

  y = MG + 8;
  putText("Podcast Insights", 22, C.head, MG, CW, "bold");
  y += 4;
  putText(date, 12, C.muted);
  y += 20;

  doc.setDrawColor(...C.cardBdr);
  doc.setLineWidth(0.75);
  doc.line(MG, y, pageW - MG, y);
  y += 24;

  // ── Domain sections ────────────────────────────────────────────────────────
  const domains = Object.entries(byDomain);
  domains.forEach(([domain, domainInsights], dIdx) => {
    const rgb = hexToRgb(DOMAIN_HEX[domain] ?? "#6b7280");
    const [r, g, b] = rgb;

    // Domain badge — only draw if there's room for the badge + first card
    const firstCardH = domainInsights.length > 0 ? measureCard(domainInsights[0]) : 0;
    if (y + S.badgeH + S.afterBadge + firstCardH > FOOTER - 8) newPage();

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    const label  = domain.toUpperCase();
    const badgeW = doc.getTextWidth(label) + S.badgePadX * 2;
    doc.setFillColor(r, g, b);
    doc.roundedRect(MG, y, badgeW, S.badgeH, 3, 3, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(label, MG + S.badgePadX, y + S.badgeH * 0.68);
    y += S.badgeH + S.afterBadge;

    // Cards
    domainInsights.forEach((ins, cIdx) => {
      const cardH = measureCard(ins);
      const cardX = MG - S.cardPadX;
      const cardW = CW + S.cardPadX * 2;

      // If card doesn't fit, go to next page and repeat the domain badge
      if (y + cardH > FOOTER - 8) {
        newPage();
        // Re-draw domain badge marked as continued
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        const contLabel = `${domain.toUpperCase()}  (cont'd)`;
        const contW = doc.getTextWidth(contLabel) + S.badgePadX * 2;
        doc.setFillColor(r, g, b);
        doc.roundedRect(MG, y, contW, S.badgeH, 3, 3, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(contLabel, MG + S.badgePadX, y + S.badgeH * 0.68);
        y += S.badgeH + S.afterBadge;
      }

      const cardY = y;

      // Draw white card bg + border
      doc.setFillColor(...C.cardBg);
      doc.setDrawColor(...C.cardBdr);
      doc.setLineWidth(0.5);
      doc.roundedRect(cardX, cardY, cardW, cardH, 5, 5, "FD");

      // Start text at card top + top padding
      y = cardY + S.cardPadTop;
      renderCardContent(ins, rgb);

      // Next card starts after this card + gap
      y = cardY + cardH + (cIdx < domainInsights.length - 1 ? S.betweenCards : 0);
    });

    // Gap between domain sections
    if (dIdx < domains.length - 1) y += S.betweenDomains;
  });

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
    const ext = fmt === "word" ? "docx" : fmt === "excel" ? "xlsx" : fmt;
    const url = `/api/insights/export?format=${fmt}&date=${date}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `insights-${date}.${ext}`;
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
          className="absolute left-0 top-full mt-1 rounded-xl border shadow-xl z-50 overflow-hidden"
          style={{ background: "var(--bg-nav)", borderColor: "var(--bdr-hov)", minWidth: 132 }}
        >
          {FORMATS.map(({ label, value, description }) => (
            <button
              key={value}
              onClick={() => handleSelect(value)}
              className="w-full flex items-center justify-between gap-3 px-2.5 py-1.5 text-xs text-left transition-colors"
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
