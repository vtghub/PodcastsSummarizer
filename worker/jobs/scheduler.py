"""
Local scheduler — runs the pipeline daily at a configured time.
Start with: python -m worker.jobs.scheduler
Can be replaced by Windows Task Scheduler, GitHub Actions, or any cron system.
"""

import time
from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from worker.config.settings import DIGEST_HOUR, DIGEST_MINUTE
from worker.jobs.pipeline import run_pipeline


def _job():
    print(f"\n[Scheduler] Triggering pipeline at {datetime.now().isoformat()}")
    run_pipeline()


def main():
    scheduler = BlockingScheduler()
    scheduler.add_job(
        _job,
        trigger=CronTrigger(hour=DIGEST_HOUR, minute=DIGEST_MINUTE),
        id="daily_pipeline",
        name="Daily podcast insights pipeline",
        misfire_grace_time=3600,    # run even if delayed up to 1 hour
    )
    print(f"[Scheduler] Running. Next job at {DIGEST_HOUR:02d}:{DIGEST_MINUTE:02d} daily.")
    print("            Press Ctrl+C to stop.")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        print("[Scheduler] Stopped.")


if __name__ == "__main__":
    main()
