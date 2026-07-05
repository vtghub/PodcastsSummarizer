"""Resolve tool binary paths, preferring the active venv's Scripts dir."""

import shutil
import sys
from pathlib import Path


def _find_bin(name: str) -> str:
    # 1. Check venv Scripts dir (same Python as current interpreter)
    scripts = Path(sys.executable).parent
    for candidate in [scripts / name, scripts / f"{name}.exe"]:
        if candidate.exists():
            return str(candidate)
    # 2. Fall back to PATH
    found = shutil.which(name)
    if found:
        return found
    raise FileNotFoundError(
        f"'{name}' not found. Install it with: pip install {name}"
    )


YT_DLP = _find_bin("yt-dlp")
