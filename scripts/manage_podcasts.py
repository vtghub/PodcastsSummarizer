"""
CLI tool to manage podcast sources.

Usage:
  python scripts/manage_podcasts.py add --name "Lex Fridman" --url <rss_url> --domain "Technology & AI"
  python scripts/manage_podcasts.py list
  python scripts/manage_podcasts.py disable <id>
  python scripts/manage_podcasts.py enable <id>
  python scripts/manage_podcasts.py run              # trigger pipeline now
  python scripts/manage_podcasts.py run --dry-run    # fetch episodes, no download/email
  python scripts/manage_podcasts.py send-digest      # send today's digest manually
"""

import argparse
import hashlib
import sys
from datetime import datetime

sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent.parent))

from worker.config.settings import DOMAINS
from worker.core.interfaces import PodcastSource
from worker.core.registry import get_storage_provider


def cmd_add(args):
    storage = get_storage_provider()
    source_id = hashlib.md5(args.url.encode()).hexdigest()[:12]
    source = PodcastSource(
        id=source_id,
        name=args.name,
        url=args.url,
        source_type=args.type,
        domain=args.domain,
    )
    storage.save_source(source)
    print(f"Added: [{source_id}] {args.name} — {args.domain}")


def cmd_list(args):
    storage = get_storage_provider()
    sources = storage.get_sources(enabled_only=False)
    if not sources:
        print("No podcast sources configured yet.")
        return
    print(f"\n{'ID':<14} {'E'} {'Type':<8} {'Domain':<25} Name")
    print("-" * 80)
    for s in sources:
        enabled = "Y" if s.enabled else "N"
        print(f"{s.id:<14} {enabled} {s.source_type:<8} {s.domain:<25} {s.name}")


def cmd_toggle(args, enable: bool):
    storage = get_storage_provider()
    source = storage.get_source(args.id)
    if not source:
        print(f"Source not found: {args.id}")
        return
    source.enabled = enable
    storage.save_source(source)
    print(f"{'Enabled' if enable else 'Disabled'}: {source.name}")


def cmd_run(args):
    from datetime import datetime, timezone, timedelta
    from worker.jobs.pipeline import run_pipeline

    since = None
    if getattr(args, "since", None):
        since = datetime.fromisoformat(args.since).replace(tzinfo=timezone.utc)
    elif getattr(args, "latest", False):
        since = None  # None = pipeline uses 24h default
    elif getattr(args, "days", None):
        since = datetime.now(timezone.utc) - timedelta(days=args.days)

    run_pipeline(since=since, dry_run=getattr(args, "dry_run", False))


def cmd_send_digest(args):
    from collections import defaultdict
    from worker.core.registry import get_email_provider, get_storage_provider
    from worker.config.settings import DIGEST_RECIPIENT

    storage = get_storage_provider()
    date_str = getattr(args, "date", None) or datetime.now().strftime("%Y-%m-%d")
    insights = storage.get_insights_by_date(date_str)

    if not insights:
        print(f"No insights for {date_str}.")
        return

    by_domain = defaultdict(list)
    for ins in insights:
        by_domain[ins.domain].append(ins)

    email = get_email_provider()
    email.send_digest(DIGEST_RECIPIENT, date_str, dict(by_domain))


def main():
    parser = argparse.ArgumentParser(description="Podcast Insights Manager")
    sub = parser.add_subparsers(dest="command")

    # add
    p_add = sub.add_parser("add", help="Add a podcast source")
    p_add.add_argument("--name", required=True)
    p_add.add_argument("--url", required=True)
    p_add.add_argument("--type", choices=["rss", "youtube"], default="rss")
    p_add.add_argument("--domain", choices=DOMAINS, default="Other")
    p_add.set_defaults(func=cmd_add)

    # list
    p_list = sub.add_parser("list", help="List all podcast sources")
    p_list.set_defaults(func=cmd_list)

    # disable / enable
    p_dis = sub.add_parser("disable", help="Disable a podcast source")
    p_dis.add_argument("id")
    p_dis.set_defaults(func=lambda a: cmd_toggle(a, enable=False))

    p_en = sub.add_parser("enable", help="Enable a podcast source")
    p_en.add_argument("id")
    p_en.set_defaults(func=lambda a: cmd_toggle(a, enable=True))

    # run
    p_run = sub.add_parser("run", help="Run the pipeline now")
    p_run.add_argument("--dry-run", action="store_true", help="Fetch episodes but skip download/transcription/email")
    p_run.add_argument("--since", metavar="YYYY-MM-DD", help="Only process episodes published after this date")
    p_run.add_argument("--days", type=int, metavar="N", help="Process episodes from the last N days (default: 1)")
    p_run.set_defaults(func=cmd_run)

    # send-digest
    p_digest = sub.add_parser("send-digest", help="Send today's digest email")
    p_digest.add_argument("--date", help="YYYY-MM-DD (default: today)")
    p_digest.set_defaults(func=cmd_send_digest)

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return

    args.func(args)


if __name__ == "__main__":
    main()
