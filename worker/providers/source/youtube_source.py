"""
YouTube source provider.

Transcript acquisition priority:
  1. Manual captions (highest quality, often uploaded by creators)
  2. Auto-generated captions (yt-dlp --write-auto-subs)
  3. Audio download + Whisper (last resort)

Audio download is skipped entirely when captions are available.
"""

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from worker.core.interfaces import Episode, PodcastSource, SourceProvider
from worker.config.settings import AUDIO_CACHE_DIR
from worker.config.paths import YT_DLP
from worker.providers.source.transcript_utils import vtt_to_text


class YouTubeSourceProvider(SourceProvider):

    def fetch_latest_episodes(
        self, source: PodcastSource, since: datetime | None = None
    ) -> list[Episode]:
        cmd = [
            YT_DLP,
            "--flat-playlist",
            "--dump-json",
            "--no-warnings",
            "--playlist-end", "10",
            source.url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp metadata fetch failed: {result.stderr}")

        episodes: list[Episode] = []
        for line in result.stdout.strip().splitlines():
            if not line:
                continue
            try:
                meta = json.loads(line)
            except json.JSONDecodeError:
                continue

            video_id = meta.get("id", "")
            if not video_id:
                continue

            published_at = self._parse_upload_date(meta.get("upload_date", ""))
            if since and published_at <= since.replace(tzinfo=timezone.utc):
                continue

            episode_id = hashlib.md5(video_id.encode()).hexdigest()
            url = f"https://www.youtube.com/watch?v={video_id}"

            ep = Episode(
                id=episode_id,
                source_id=source.id,
                title=meta.get("title", "Untitled"),
                url=url,
                published_at=published_at,
                duration_seconds=meta.get("duration", 0) or 0,
                description=(meta.get("description") or "")[:2000],
            )
            ep._video_id = video_id  # type: ignore[attr-defined]
            episodes.append(ep)

        return episodes

    def fetch_transcript_text(self, episode: Episode) -> str | None:
        """
        Try to get captions from YouTube without downloading audio.
        Tries manual captions first, then auto-generated.
        """
        video_id = getattr(episode, "_video_id", None)
        if not video_id:
            # Reconstruct from URL
            import re
            m = re.search(r"v=([a-zA-Z0-9_-]{11})", episode.url)
            if m:
                video_id = m.group(1)

        if not video_id:
            return None

        with tempfile.TemporaryDirectory() as tmp:
            # ---------------------------------------------------------------
            # Try 1: manual captions (en, en-US, en-GB)
            # ---------------------------------------------------------------
            text = self._download_captions(
                video_id, tmp,
                extra_args=["--sub-lang", "en,en-US,en-GB", "--write-subs"],
                label="manual captions",
            )
            if text:
                return text

            # ---------------------------------------------------------------
            # Try 2: auto-generated captions
            # ---------------------------------------------------------------
            text = self._download_captions(
                video_id, tmp,
                extra_args=["--sub-lang", "en", "--write-auto-subs"],
                label="auto captions",
            )
            if text:
                return text

        return None

    def download_audio(self, episode: Episode, output_dir: str = str(AUDIO_CACHE_DIR)) -> str:
        out_template = os.path.join(output_dir, f"{episode.id}.%(ext)s")
        mp3_path = os.path.join(output_dir, f"{episode.id}.mp3")

        if os.path.exists(mp3_path):
            return mp3_path

        cmd = [
            YT_DLP,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "5",
            "--no-playlist",
            "--output", out_template,
            "--quiet",
            episode.url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp download failed: {result.stderr}")

        if os.path.exists(mp3_path):
            return mp3_path
        for fname in os.listdir(output_dir):
            if fname.startswith(episode.id):
                return os.path.join(output_dir, fname)

        raise FileNotFoundError(f"Downloaded file not found for episode {episode.id}")

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _download_captions(
        self, video_id: str, tmp_dir: str, extra_args: list[str], label: str
    ) -> str | None:
        """
        Run yt-dlp to write subtitle files into tmp_dir.
        Returns plain text if any subtitle file is found, else None.
        """
        url = f"https://www.youtube.com/watch?v={video_id}"
        cmd = [
            YT_DLP,
            "--skip-download",          # no audio
            "--no-warnings",
            "--output", os.path.join(tmp_dir, "%(id)s.%(ext)s"),
            *extra_args,
            url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
        # yt-dlp exits 0 even when no subs are available, so we check file output

        vtt_files = list(Path(tmp_dir).glob("*.vtt"))
        srt_files = list(Path(tmp_dir).glob("*.srt"))
        sub_files = vtt_files + srt_files

        if not sub_files:
            return None

        sub_file = sub_files[0]
        raw = sub_file.read_text(encoding="utf-8", errors="replace")
        text = vtt_to_text(raw) if sub_file.suffix == ".vtt" else _srt_to_text(raw)

        if len(text) < 200:
            return None

        print(f"    [transcript] YouTube {label}: {len(text):,} chars from {sub_file.name}")
        return text

    @staticmethod
    def _parse_upload_date(upload_date: str) -> datetime:
        try:
            return datetime.strptime(upload_date, "%Y%m%d").replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            return datetime.now(timezone.utc)


def _srt_to_text(srt: str) -> str:
    import re
    lines = []
    for line in srt.splitlines():
        line = line.strip()
        if not line or re.match(r"^\d+$", line) or "-->" in line:
            continue
        line = re.sub(r"<[^>]+>", "", line).strip()
        if line:
            lines.append(line)
    return " ".join(lines)
