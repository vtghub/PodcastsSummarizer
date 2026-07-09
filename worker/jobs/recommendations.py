"""
Weekly recommendation job.

Sends each digest-enabled user:
  1. Best insights from the past 7 days (LLM-ranked, from their subscriptions)
  2. Trending podcasts they aren't subscribed to (in their domains)
"""

from datetime import date

from worker.core.registry import get_email_provider, get_llm_provider, get_storage_provider

DOMAINS = [
    "Technology & AI",
    "Business & Startups",
    "Health & Science",
    "Finance & Investing",
    "Leadership & Productivity",
    "Society & Culture",
    "General",
    "Other",
]


def run_weekly_recommendations(date_str: str | None = None) -> None:
    if date_str is None:
        date_str = date.today().isoformat()

    storage = get_storage_provider()
    email_provider = get_email_provider()
    llm = get_llm_provider()

    users = storage.get_users_with_digest_enabled()
    print(f"[Weekly] Running for {date_str} — {len(users)} user(s)")

    for user in users:
        try:
            source_ids = storage.get_user_subscribed_source_ids(user.user_id)

            # Section 1: Best insights from the week
            week_insights = storage.get_insights_for_week(source_ids, days=7)
            domains = user.digest_domains or DOMAINS
            top_insights = llm.rank_insights(week_insights, domains, top_n=5)

            # Section 2: Trending podcasts the user isn't subscribed to
            recommended = storage.get_trending_sources(
                domains=domains,
                exclude_ids=source_ids,
                days=7,
                limit=5,
            )

            if not top_insights and not recommended:
                print(f"[Weekly] {user.email} — nothing to send, skipping")
                continue

            email_provider.send_weekly_recommendations(
                to=user.email,
                week_of=date_str,
                top_insights=top_insights,
                recommended_sources=recommended,
            )
            print(
                f"[Weekly] {user.email} — sent {len(top_insights)} insights, "
                f"{len(recommended)} recommendations"
            )
        except Exception as exc:
            print(f"[Weekly] {user.email} — error: {exc}")
