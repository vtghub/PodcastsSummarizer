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

function insightsToWord(date: string, insights: Insight[]): string {
  const sections = insights.map((ins) => `
    <h2 style="font-size:13pt;color:#333;margin-bottom:2pt">${ins.source_name ?? ""}${ins.episode_title ? ` — ${ins.episode_title}` : ""}</h2>
    <p style="font-size:9pt;color:#888;margin:0 0 6pt">${ins.domain} · ${date}</p>
    <p style="margin:0 0 8pt">${ins.summary}</p>
    ${ins.key_points.length ? `<p style="font-size:9pt;font-weight:bold;margin:6pt 0 2pt">KEY POINTS</p><ul style="margin:0 0 8pt">${ins.key_points.map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
    ${ins.key_quotes.length ? `<p style="font-size:9pt;font-weight:bold;margin:6pt 0 2pt">KEY QUOTES</p><ul style="margin:0 0 8pt">${ins.key_quotes.map((q) => `<li>"${q}"</li>`).join("")}</ul>` : ""}
    ${ins.action_items.length ? `<p style="font-size:9pt;font-weight:bold;margin:6pt 0 2pt">ACTION ITEMS</p><ul style="margin:0 0 8pt">${ins.action_items.map((a) => `<li>${a}</li>`).join("")}</ul>` : ""}
    ${ins.tags.length ? `<p style="font-size:8pt;color:#777;margin:4pt 0 0">${ins.tags.map((t) => `#${t}`).join(" ")}</p>` : ""}
    <hr style="border:none;border-top:1px solid #ddd;margin:12pt 0">`).join("");

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<title>Podcast Insights — ${date}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>
  body { font-family: Calibri, sans-serif; font-size: 11pt; color: #1a1a1a; margin: 2cm; line-height: 1.5; }
  h1 { font-size: 18pt; color: #111; margin-bottom: 4pt; }
  ul { padding-left: 18pt; }
  li { margin-bottom: 3pt; }
</style>
</head>
<body>
<h1>Podcast Insights</h1>
<p style="color:#666;font-size:10pt;margin:0 0 18pt">${date} · ${insights.length} insight${insights.length !== 1 ? "s" : ""}</p>
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

  if (fmt === "word") {
    return new Response(insightsToWord(date, insights), {
      headers: {
        "Content-Type": "application/msword; charset=utf-8",
        "Content-Disposition": `attachment; filename="insights-${date}.doc"`,
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
