import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getInsightsByDate, type Insight } from "@/lib/db";

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
<script>window.onload = function () { window.print(); };</script>
</head>
<body>
<h1>Podcast Insights</h1>
<p class="subtitle">${date} · ${insights.length} insight${insights.length !== 1 ? "s" : ""}</p>
${sections}
</body>
</html>`;
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
