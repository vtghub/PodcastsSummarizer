import nodemailer from "nodemailer";
import type { Insight } from "./db";

const DOMAIN_COLORS: Record<string, string> = {
  "Technology & AI":          "#3b82f6",
  "Business & Startups":      "#10b981",
  "Health & Science":         "#ec4899",
  "Finance & Investing":      "#f59e0b",
  "Leadership & Productivity":"#8b5cf6",
  "Society & Culture":        "#ef4444",
  "Other":                    "#6b7280",
};

export async function sendDigestEmail(
  to: string,
  date: string,
  insightsByDomain: Record<string, Insight[]>,
): Promise<void> {
  const sender  = process.env.GMAIL_SENDER;
  const appPass = process.env.GMAIL_APP_PASSWORD;
  if (!sender || !appPass) throw new Error("GMAIL_SENDER or GMAIL_APP_PASSWORD not configured");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: sender, pass: appPass },
  });

  await transporter.sendMail({
    from: `"Podcast Insights" <${sender}>`,
    to,
    subject: `Podcast Insights — ${date}`,
    html: renderHtml(date, insightsByDomain),
    text: renderText(date, insightsByDomain),
  });
}

export function buildDigestHtml(date: string, insightsByDomain: Record<string, Insight[]>): string {
  return renderHtml(date, insightsByDomain);
}

function renderHtml(date: string, insightsByDomain: Record<string, Insight[]>): string {
  const sections = Object.entries(insightsByDomain).map(([domain, insights]) => {
    const color = DOMAIN_COLORS[domain] ?? "#6b7280";
    const cards = insights.map((ins) => {
      const points  = ins.key_points.map((p) => `<li>${esc(p)}</li>`).join("");
      const quotes  = ins.key_quotes.map((q) =>
        `<blockquote style="border-left:3px solid ${color};margin:8px 0;padding:6px 12px;color:#555;">"${esc(q)}"</blockquote>`
      ).join("");
      const actions = ins.action_items.length
        ? `<strong style="color:#111;font-size:13px;">Action Items</strong>
           <ul style="color:#374151;margin:8px 0;padding-left:20px;line-height:1.6;">
             ${ins.action_items.map((a) => `<li>${esc(a)}</li>`).join("")}
           </ul>`
        : "";
      const sourceLine = ins.source_name
        ? `<p style="font-size:11px;color:#9ca3af;margin:0 0 8px;">${esc(ins.source_name)}${ins.episode_title ? ` · ${esc(ins.episode_title)}` : ""}</p>`
        : "";
      return `
        <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,.06);">
          ${sourceLine}
          <p style="color:#374151;margin:0 0 12px;">${esc(ins.summary)}</p>
          <strong style="color:#111;font-size:13px;">Key Points</strong>
          <ul style="color:#374151;margin:8px 0 12px;padding-left:20px;line-height:1.6;">${points}</ul>
          ${quotes}
          ${actions}
        </div>`;
    }).join("");

    return `
      <div style="margin-bottom:32px;">
        <div style="display:inline-block;background:${color};color:#fff;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700;margin-bottom:16px;">
          ${esc(domain.toUpperCase())}
        </div>
        ${cards}
      </div>`;
  }).join("");

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;margin:0;padding:24px;">
    <div style="max-width:680px;margin:0 auto;">
      <h1 style="font-size:22px;color:#111;margin-bottom:4px;">🎙 Podcast Insights</h1>
      <p style="color:#6b7280;margin:0 0 28px;">${esc(date)}</p>
      ${sections}
      <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;">
        Manage your digest preferences in your <a href="${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/profile" style="color:#9ca3af;">Profile</a>.
      </p>
    </div>
  </body></html>`;
}

function renderText(date: string, insightsByDomain: Record<string, Insight[]>): string {
  const lines = [`PODCAST INSIGHTS — ${date}`, "=".repeat(50), ""];
  for (const [domain, insights] of Object.entries(insightsByDomain)) {
    lines.push(`[${domain.toUpperCase()}]`, "");
    for (const ins of insights) {
      if (ins.source_name) lines.push(`  ${ins.source_name}${ins.episode_title ? ` · ${ins.episode_title}` : ""}`, "");
      lines.push(`  ${ins.summary}`, "", "  KEY POINTS:");
      ins.key_points.forEach((p) => lines.push(`    • ${p}`));
      if (ins.action_items.length) {
        lines.push("", "  ACTION ITEMS:");
        ins.action_items.forEach((a) => lines.push(`    → ${a}`));
      }
      lines.push("");
    }
    lines.push("-".repeat(40));
  }
  return lines.join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
