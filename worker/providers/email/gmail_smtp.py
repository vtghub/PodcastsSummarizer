"""Gmail SMTP email provider — uses a Gmail App Password, zero cost."""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from worker.core.interfaces import EmailProvider, Insight, PodcastSource
from worker.config.settings import GMAIL_SENDER, GMAIL_APP_PASSWORD


class GmailSMTPProvider(EmailProvider):

    def send_digest(self, to: str, date: str, insights_by_domain: dict[str, list[Insight]]) -> bool:
        if not GMAIL_SENDER or not GMAIL_APP_PASSWORD:
            raise ValueError("GMAIL_SENDER and GMAIL_APP_PASSWORD must be set in .env")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Podcast Insights — {date}"
        msg["From"] = GMAIL_SENDER
        msg["To"] = to

        html = _render_html(date, insights_by_domain)
        text = _render_text(date, insights_by_domain)

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_SENDER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_SENDER, to, msg.as_string())

        print(f"[Email] Digest sent to {to} for {date}")
        return True


    def send_weekly_recommendations(
        self,
        to: str,
        week_of: str,
        top_insights: list[Insight],
        recommended_sources: list[dict],
    ) -> bool:
        if not GMAIL_SENDER or not GMAIL_APP_PASSWORD:
            raise ValueError("GMAIL_SENDER and GMAIL_APP_PASSWORD must be set in .env")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Your Weekly Podcast Roundup — Week of {week_of}"
        msg["From"] = GMAIL_SENDER
        msg["To"] = to

        html = _render_weekly_html(week_of, top_insights, recommended_sources)
        text = _render_weekly_text(week_of, top_insights, recommended_sources)

        msg.attach(MIMEText(text, "plain"))
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(GMAIL_SENDER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_SENDER, to, msg.as_string())

        print(f"[Email] Weekly recommendations sent to {to} for week of {week_of}")
        return True


class ConsoleEmailProvider(EmailProvider):
    """Dev-mode provider — prints the digest to stdout instead of sending it."""

    def send_digest(self, to: str, date: str, insights_by_domain: dict[str, list[Insight]]) -> bool:
        print("\n" + "=" * 60)
        print(f"[DEV EMAIL] To: {to} | Date: {date}")
        print("=" * 60)
        print(_render_text(date, insights_by_domain))
        return True


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------

def _render_text(date: str, insights_by_domain: dict[str, list[Insight]]) -> str:
    lines = [f"PODCAST INSIGHTS — {date}", "=" * 50, ""]
    for domain, insights in insights_by_domain.items():
        lines += [f"[{domain.upper()}]", ""]
        for ins in insights:
            lines += [f"  {ins.summary}", ""]
            lines += ["  KEY POINTS:"]
            for p in ins.key_points:
                lines.append(f"    • {p}")
            if ins.action_items:
                lines += ["", "  ACTION ITEMS:"]
                for a in ins.action_items:
                    lines.append(f"    → {a}")
            lines.append("")
        lines.append("-" * 40)
    return "\n".join(lines)


def _render_html(date: str, insights_by_domain: dict[str, list[Insight]]) -> str:
    domain_sections = ""
    domain_colors = {
        "Technology & AI": "#3b82f6",
        "Business & Startups": "#10b981",
        "Health & Science": "#ec4899",
        "Finance & Investing": "#f59e0b",
        "Leadership & Productivity": "#8b5cf6",
        "Society & Culture": "#ef4444",
        "Other": "#6b7280",
    }

    for domain, insights in insights_by_domain.items():
        color = domain_colors.get(domain, "#6b7280")
        cards = ""
        for ins in insights:
            points_html = "".join(f"<li>{p}</li>" for p in ins.key_points)
            actions_html = "".join(f"<li>{a}</li>" for a in ins.action_items) if ins.action_items else ""
            quotes_html = ""
            if ins.key_quotes:
                quotes_html = "".join(
                    f'<blockquote style="border-left:3px solid {color};margin:8px 0;padding:6px 12px;color:#555;">'
                    f'"{q}"</blockquote>'
                    for q in ins.key_quotes
                )

            cards += f"""
            <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:16px;
                        border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,.06);">
              <p style="color:#374151;margin:0 0 12px;">{ins.summary}</p>
              <strong style="color:#111;font-size:13px;">Key Points</strong>
              <ul style="color:#374151;margin:8px 0 12px;padding-left:20px;line-height:1.6;">{points_html}</ul>
              {quotes_html}
              {"<strong style='color:#111;font-size:13px;'>Action Items</strong><ul style='color:#374151;margin:8px 0;padding-left:20px;line-height:1.6;'>" + actions_html + "</ul>" if actions_html else ""}
            </div>
            """

        domain_sections += f"""
        <div style="margin-bottom:32px;">
          <div style="display:inline-block;background:{color};color:#fff;padding:4px 12px;
                      border-radius:4px;font-size:12px;font-weight:700;margin-bottom:16px;">
            {domain.upper()}
          </div>
          {cards}
        </div>
        """

    return f"""
    <!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        background:#f9fafb;margin:0;padding:24px;">
      <div style="max-width:680px;margin:0 auto;">
        <h1 style="font-size:22px;color:#111;margin-bottom:4px;">Podcast Insights</h1>
        <p style="color:#6b7280;margin:0 0 28px;">{date}</p>
        {domain_sections}
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;">
          Generated by Podcast Insights System
        </p>
      </div>
    </body></html>
    """


# ---------------------------------------------------------------------------
# Weekly recommendations renderers
# ---------------------------------------------------------------------------

def _render_weekly_text(week_of: str, insights: list[Insight], sources: list[dict]) -> str:
    lines = [f"YOUR WEEKLY PODCAST ROUNDUP — Week of {week_of}", "=" * 55, ""]

    if insights:
        lines += ["BEST INSIGHTS THIS WEEK", "-" * 30, ""]
        for ins in insights:
            lines.append(f"  {ins.summary}")
            for p in ins.key_points:
                lines.append(f"    • {p}")
            lines.append("")

    if sources:
        lines += ["PODCASTS YOU MIGHT LIKE", "-" * 30, ""]
        for s in sources:
            lines.append(f"  {s['name']} ({s['domain']}) — {s['insight_count']} episode(s) this week")
        lines.append("")

    lines.append("Update preferences at your profile page.")
    return "\n".join(lines)


def _render_weekly_html(week_of: str, insights: list[Insight], sources: list[dict]) -> str:
    domain_colors = {
        "Technology & AI": "#3b82f6",
        "Business & Startups": "#10b981",
        "Health & Science": "#ec4899",
        "Finance & Investing": "#f59e0b",
        "Leadership & Productivity": "#8b5cf6",
        "Society & Culture": "#ef4444",
        "General": "#6b7280",
        "Other": "#6b7280",
    }

    insight_cards = ""
    for ins in insights:
        points_html = "".join(f"<li>{p}</li>" for p in ins.key_points[:3])
        insight_cards += f"""
        <div style="background:#fff;border-radius:8px;padding:20px;margin-bottom:12px;
                    border:1px solid #e5e7eb;box-shadow:0 1px 3px rgba(0,0,0,.06);">
          <p style="color:#374151;margin:0 0 10px;">{ins.summary}</p>
          <ul style="color:#374151;margin:0;padding-left:20px;line-height:1.6;font-size:13px;">{points_html}</ul>
        </div>
        """

    source_cards = ""
    for s in sources:
        color = domain_colors.get(s["domain"], "#6b7280")
        source_cards += f"""
        <div style="background:#fff;border-radius:8px;padding:16px;margin-bottom:10px;
                    border:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;">
          <div style="flex:1;min-width:0;">
            <p style="font-weight:600;color:#111;margin:0 0 4px;font-size:14px;">{s['name']}</p>
            <span style="background:{color};color:#fff;padding:2px 8px;border-radius:4px;
                         font-size:11px;font-weight:700;">{s['domain']}</span>
          </div>
          <span style="color:#6b7280;font-size:12px;white-space:nowrap;">{s['insight_count']} ep this week</span>
        </div>
        """

    insights_section = f"""
    <div style="margin-bottom:32px;">
      <h2 style="font-size:16px;color:#111;margin:0 0 16px;">Best Insights This Week</h2>
      {insight_cards or '<p style="color:#6b7280;font-size:14px;">No new insights this week.</p>'}
    </div>
    """ if insights else ""

    sources_section = f"""
    <div style="margin-bottom:32px;">
      <h2 style="font-size:16px;color:#111;margin:0 0 8px;">Podcasts You Might Like</h2>
      <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">Active in your domains this week — not yet in your subscriptions.</p>
      {source_cards}
    </div>
    """ if sources else ""

    return f"""
    <!DOCTYPE html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
        background:#f9fafb;margin:0;padding:24px;">
      <div style="max-width:680px;margin:0 auto;">
        <h1 style="font-size:22px;color:#111;margin-bottom:4px;">Your Weekly Podcast Roundup</h1>
        <p style="color:#6b7280;margin:0 0 28px;">Week of {week_of}</p>
        {insights_section}
        {sources_section}
        <p style="color:#9ca3af;font-size:12px;text-align:center;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px;">
          You're receiving this because you have digest enabled.
          Update preferences at your profile page.
        </p>
      </div>
    </body></html>
    """
