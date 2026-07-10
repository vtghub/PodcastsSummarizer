import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getInsightsByDate, type Insight } from "@/lib/db";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  BorderStyle, ShadingType, convertInchesToTwip,
} from "docx";

function escapeCsv(val: unknown): string {
  const s = String(val ?? "").replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

function insightsToCsv(date: string, insights: Insight[]): string {
  const headers = [
    "Date", "Domain", "Source", "Episode",
    "Summary", "Key Points", "Key Quotes", "Action Items", "Tags",
  ];
  const rows = insights.map((ins) =>
    [
      date,
      ins.domain,
      ins.source_name ?? "",
      ins.episode_title ?? "",
      ins.summary,
      ins.key_points.join(" | "),
      ins.key_quotes.join(" | "),
      ins.action_items.join(" | "),
      ins.tags.join(", "),
    ].map(escapeCsv).join(",")
  );
  return [headers.join(","), ...rows].join("\r\n");
}

function insightsToPrintHtml(date: string, insights: Insight[]): string {
  const sections = insights.map((ins) => `
    <section class="insight">
      <div class="meta">${ins.domain} · ${ins.source_name ?? ""} · ${ins.episode_title ?? ""}</div>
      <p class="summary">${ins.summary}</p>
      ${ins.key_points.length ? `<h4>Key Points</h4><ul>${ins.key_points.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
      ${ins.key_quotes.length ? `<h4>Key Quotes</h4><ul>${ins.key_quotes.map((q) => `<li>"${q}"</li>`).join("")}</ul>` : ""}
      ${ins.action_items.length ? `<h4>Action Items</h4><ul>${ins.action_items.map((a) => `<li>${a}</li>`).join("")}</ul>` : ""}
      ${ins.tags.length ? `<p class="tags">${ins.tags.map((t) => `#${t}`).join(" ")}</p>` : ""}
    </section>`).join("<hr>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Podcast Insights — ${date}</title>
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 2rem auto; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-bottom: 2rem; font-size: 0.9rem; }
  .insight { margin: 1.5rem 0; }
  .meta { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .summary { margin: 0.5rem 0 1rem; }
  h4 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: #555; margin: 0.75rem 0 0.25rem; }
  ul { margin: 0 0 0.5rem; padding-left: 1.25rem; }
  li { margin-bottom: 0.25rem; font-size: 0.9rem; }
  .tags { color: #777; font-size: 0.8rem; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5rem 0; }
  @media print { body { margin: 1rem; } }
</style>
<script>
  window.onload = function () { window.print(); };
  window.onafterprint = function () {
    document.body.innerHTML = '<p style="font-family:sans-serif;text-align:center;margin-top:4rem;color:#888">Done — you can close this tab.</p>';
  };
</script>
</head>
<body>
<h1>Podcast Insights</h1>
<p class="subtitle">${date} · ${insights.length} insight${insights.length !== 1 ? "s" : ""}</p>
${sections}
</body>
</html>`;
}

const DOMAIN_COLOR: Record<string, string> = {
  "Technology & AI":           "3b82f6",
  "Business & Startups":       "10b981",
  "Health & Science":          "ec4899",
  "Finance & Investing":       "f59e0b",
  "Leadership & Productivity": "8b5cf6",
  "Society & Culture":         "ef4444",
  "General":                   "6b7280",
  "Other":                     "6b7280",
};

async function insightsToWordBuffer(date: string, insights: Insight[]): Promise<Buffer> {
  const pt = (n: number) => n * 20; // half-points → twips (docx uses half-points via `size`)

  function sectionLabel(text: string, color: string): Paragraph {
    return new Paragraph({
      spacing: { before: pt(8), after: pt(3) },
      children: [
        new TextRun({
          text,
          bold: true,
          size: 16, // 8pt
          color,
          allCaps: true,
        }),
      ],
    });
  }

  function bullet(text: string): Paragraph {
    return new Paragraph({
      indent: { left: convertInchesToTwip(0.25) },
      spacing: { after: pt(2) },
      children: [
        new TextRun({ text: "• ", color: "555555", size: 20 }),
        new TextRun({ text, size: 20, color: "374151" }),
      ],
    });
  }

  function quote(text: string, color: string): Paragraph {
    return new Paragraph({
      indent: { left: convertInchesToTwip(0.3) },
      spacing: { after: pt(4) },
      border: {
        left: { style: BorderStyle.SINGLE, size: 12, color, space: 8 },
      },
      children: [
        new TextRun({ text: `"${text}"`, italics: true, size: 20, color: "555555" }),
      ],
    });
  }

  function actionItem(text: string): Paragraph {
    return new Paragraph({
      indent: { left: convertInchesToTwip(0.25) },
      spacing: { after: pt(2) },
      children: [
        new TextRun({ text: "→ ", color: "555555", size: 20 }),
        new TextRun({ text, size: 20, color: "374151" }),
      ],
    });
  }

  function divider(): Paragraph {
    return new Paragraph({
      spacing: { before: pt(10), after: pt(10) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "e5e7eb" } },
      children: [],
    });
  }

  const children: Paragraph[] = [
    // Title
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: pt(4) },
      children: [
        new TextRun({ text: "Podcast Insights", bold: true, size: 48, color: "111827", font: "Calibri" }),
      ],
    }),
    // Subtitle
    new Paragraph({
      spacing: { after: pt(16) },
      children: [
        new TextRun({ text: `${date}  ·  ${insights.length} insight${insights.length !== 1 ? "s" : ""}`, size: 20, color: "6b7280", font: "Calibri" }),
      ],
    }),
    divider(),
  ];

  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const color = DOMAIN_COLOR[ins.domain] ?? "6b7280";

    // Source · episode line
    const srcLine = [ins.source_name, ins.episode_title].filter(Boolean).join("  ·  ");

    children.push(
      new Paragraph({ spacing: { before: pt(12) }, children: [] }), // spacer
    );
    // We can't push a Table directly into children[] — collect as sections
    // Instead use a paragraph with colored background via shading
    children.push(
      new Paragraph({
        spacing: { before: pt(2), after: pt(6) },
        shading: { type: ShadingType.SOLID, color, fill: color },
        children: [
          new TextRun({ text: `  ${ins.domain.toUpperCase()}  `, bold: true, size: 16, color: "ffffff", font: "Calibri" }),
        ],
      }),
    );

    if (srcLine) {
      children.push(
        new Paragraph({
          spacing: { after: pt(4) },
          children: [new TextRun({ text: srcLine, size: 18, color: "9ca3af", font: "Calibri" })],
        }),
      );
    }

    // Summary
    children.push(
      new Paragraph({
        spacing: { after: pt(8) },
        children: [new TextRun({ text: ins.summary, size: 22, color: "374151", font: "Calibri" })],
      }),
    );

    // Key points
    if (ins.key_points.length) {
      children.push(sectionLabel("Key Points", color));
      ins.key_points.forEach((p) => children.push(bullet(p)));
    }

    // Key quotes
    if (ins.key_quotes.length) {
      children.push(sectionLabel("Key Quotes", color));
      ins.key_quotes.forEach((q) => children.push(quote(q, color)));
    }

    // Action items
    if (ins.action_items.length) {
      children.push(sectionLabel("Action Items", color));
      ins.action_items.forEach((a) => children.push(actionItem(a)));
    }

    // Tags
    if (ins.tags.length) {
      children.push(
        new Paragraph({
          spacing: { before: pt(6), after: pt(2) },
          children: [
            new TextRun({ text: ins.tags.map((t) => `#${t}`).join("  "), size: 16, color: "9ca3af", font: "Calibri" }),
          ],
        }),
      );
    }

    if (i < insights.length - 1) children.push(divider());
  }

  const doc = new Document({
    creator: "Podcast Insights",
    title: `Podcast Insights — ${date}`,
    description: `${insights.length} insights for ${date}`,
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "374151" },
          paragraph: { spacing: { line: 320 } },
        },
      },
    },
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}

function insightsToJson(date: string, insights: Insight[]): string {
  return JSON.stringify(
    {
      date,
      count: insights.length,
      insights: insights.map((ins) => ({
        id: ins.id,
        domain: ins.domain,
        source: ins.source_name ?? null,
        episode: ins.episode_title ?? null,
        summary: ins.summary,
        key_points: ins.key_points,
        key_quotes: ins.key_quotes,
        action_items: ins.action_items,
        tags: ins.tags,
      })),
    },
    null,
    2
  );
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
  const fmt = searchParams.get("format") ?? "csv";

  const insights = await getInsightsByDate(date, userId);

  if (fmt === "word") {
    const buf = await insightsToWordBuffer(date, insights);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="insights-${date}.docx"`,
      },
    });
  }

  if (fmt === "pdf") {
    return new Response(insightsToPrintHtml(date, insights), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (fmt === "json") {
    return new Response(insightsToJson(date, insights), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="insights-${date}.json"`,
      },
    });
  }

  const csv = insightsToCsv(date, insights);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="insights-${date}.csv"`,
    },
  });
}
