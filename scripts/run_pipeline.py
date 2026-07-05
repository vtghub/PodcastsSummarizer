"""
Standalone daily pipeline runner.
Called by run_daily.bat (Task Scheduler) or directly.
Writes a clean UTF-8 log to data/logs/pipeline_YYYY-MM-DD.log
and also streams to stdout.
"""

import sys
import io
from datetime import datetime
from pathlib import Path

# Ensure project root is on path regardless of CWD
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from worker.config.settings import DATA_DIR
from worker.jobs.pipeline import run_pipeline

# ── Logging setup ────────────────────────────────────────────────────────────
LOG_DIR = DATA_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / f"pipeline_{datetime.now().strftime('%Y-%m-%d')}.log"

class Tee(io.TextIOBase):
    """Write to both a file and the original stdout simultaneously."""
    def __init__(self, file_path: Path, original):
        self._file = open(file_path, "a", encoding="utf-8")
        self._orig = original

    def write(self, s: str) -> int:
        self._file.write(s)
        self._file.flush()
        try:
            self._orig.write(s)
            self._orig.flush()
        except Exception:
            pass
        return len(s)

    def flush(self):
        self._file.flush()

    def close(self):
        self._file.close()

# Redirect stdout/stderr through Tee
tee = Tee(LOG_FILE, sys.stdout)
sys.stdout = tee  # type: ignore
sys.stderr = tee  # type: ignore

# ── Run ───────────────────────────────────────────────────────────────────────
print(f"\n{'='*60}")
print(f"Pipeline started at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(f"{'='*60}")

try:
    stats = run_pipeline()
    print(f"\n{'='*60}")
    print(f"Pipeline finished at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"Result: {stats}")
    print(f"{'='*60}")
    exit_code = 0 if stats["errors"] == 0 else 1
except Exception as e:
    import traceback
    print(f"\n[FATAL] Pipeline crashed: {e}")
    traceback.print_exc()
    exit_code = 2
finally:
    tee.close()
    sys.stdout = tee._orig  # type: ignore
    sys.stderr = tee._orig  # type: ignore

sys.exit(exit_code)
