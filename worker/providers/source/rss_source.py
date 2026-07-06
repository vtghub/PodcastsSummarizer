"""
RSS feed source provider.

Transcript acquisition priority:
  1. <podcast:transcript> tag  — Podcast 2.0 standard (text/plain, text/html, text/vtt, application/srt)
  2. <content:encoded>         — some feeds embed full HTML transcripts here
  3. Audio download + Whisper  — last resort (handled by pipeline, not here)
"""

import hashlib
import json as _json
import os
import subprocess
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import feedparser
import requests

from worker.core.interfaces import Episode, PodcastSource, SourceProvider
from worker.config.settings import AUDIO_CACHE_DIR
from worker.config.paths import YT_DLP
from worker.providers.source.transcript_utils import detect_and_convert


# Podcast 2.0 transcript namespace
_PODCAST_NS = "https://podcastindex.org/namespace/1.0"

_TEXT_MIME_TYPES = {
    "text/plain", "text/html", "text/vtt", "text/srt",
    "application/x-subrip", "application/srt",
}


class RSSSourceProvider(SourceProvider):

    def fetch_latest_episodes(
        self, source: PodcastSource, since: datetime | None = None
    ) -> list[Episode]:
        feed = feedparser.parse(source.url)
        episodes: list[Episode] = []

        for entry in feed.entries:
            audio_url = self._extract_audio_url(entry)
            if not audio_url:
                continue

            published_at = self._parse_date(entry)
            if since and published_at <= since.replace(tzinfo=timezone.utc):
                continue

            episode_id = hashlib.md5(audio_url.encode()).hexdigest()

            # Stash the raw feed entry so fetch_transcript_text can use it
            ep = Episode(
                id=episode_id,
                source_id=source.id,
                title=entry.get("title", "Untitled"),
                url=audio_url,
                published_at=published_at,
                duration_seconds=self._parse_duration(entry),
                description=entry.get("summary", "")[:2000],
            )
            # Attach raw entry as a private hint (not part of the dataclass contract)
            ep._feed_entry = entry  # type: ignore[attr-defined]
            episodes.append(ep)

        return episodes

    def fetch_transcript_text(self, episode: Episode) -> str | None:
        entry = getattr(episode, "_feed_entry", None)

        # ---------------------------------------------------------------
        # 1. <podcast:transcript> — Podcast 2.0
        # ---------------------------------------------------------------
        transcript_url = self._extract_podcast_transcript_url(entry)
        if transcript_url:
            text = self._download_transcript_url(transcript_url)
            if text:
                print(f"    [transcript] Fetched via <podcast:transcript>: {len(text):,} chars")
                return text

        # ---------------------------------------------------------------
        # 2. <content:encoded> — full HTML transcript embedded in feed
        # ---------------------------------------------------------------
        if entry:
            content_blocks = entry.get("content", [])
            for block in content_blocks:
                raw = block.get("value", "")
                if len(raw) > 2000:   # Short descriptions aren't transcripts
                    text = detect_and_convert(raw, block.get("type", ""))
                    if len(text) > 1000:
                        print(f"    [transcript] Extracted from <content:encoded>: {len(text):,} chars")
                        return text

        return None

    def download_audio(self, episode: Episode, output_dir: str = str(AUDIO_CACHE_DIR)) -> str:
        out_path = os.path.join(output_dir, f"{episode.id}.mp3")
        if os.path.exists(out_path):
            return out_path

        cmd = [
            YT_DLP,
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "5",
            "--no-playlist",
            "--output", out_path.replace(".mp3", ".%(ext)s"),
            "--quiet",
            episode.url,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp failed for {episode.url}: {result.stderr}")

        if os.path.exists(out_path):
            return out_path
        for fname in os.listdir(output_dir):
            if fname.startswith(episode.id):
                return os.path.join(output_dir, fname)

        raise FileNotFoundError(f"Downloaded file not found for episode {episode.id}")

    def fetch_platform_links(self, source) -> dict:
        """
        Discover platform URLs for a source. Returns any subset of:
        {spotify, apple, youtube, website}.
        """
        links: dict = {}

        if source.source_type == "youtube":
            links["youtube"] = source.url
            return links

        try:
            feed = feedparser.parse(source.url)
        except Exception as e:
            print(f"    [platform] RSS parse failed for {source.name}: {e}")
            return links

        # Website from RSS channel <link>
        website = getattr(feed.feed, "link", None)
        if website and isinstance(website, str) and website.startswith("http"):
            links["website"] = website

        # Apple Podcasts via iTunes Search API (public, no key required)
        try:
            query = urllib.parse.quote(source.name)
            api_url = f"https://itunes.apple.com/search?media=podcast&term={query}&limit=10"
            req = urllib.request.Request(api_url, headers={"User-Agent": "PodcastInsights/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = _json.loads(resp.read())
            results = data.get("results", [])
            apple_url = None
            for r in results:
                if r.get("feedUrl", "").rstrip("/") == source.url.rstrip("/"):
                    apple_url = r.get("trackViewUrl")
                    break
            if not apple_url and results:
                apple_url = results[0].get("trackViewUrl")
            if apple_url:
                links["apple"] = apple_url
        except Exception as e:
            print(f"    [platform] iTunes Search API lookup failed for {source.name}: {e}")

        # Spotify — cascade through providers until one succeeds
        spotify_url = self._discover_spotify(source, feed)
        if spotify_url:
            links["spotify"] = spotify_url

        return links

    def _discover_spotify(self, source, feed) -> str | None:
        """
        Try each provider in order, return the first Spotify show URL found.
        Providers are skipped silently when their API key is not configured
        or when a rate limit (429) is returned — preserving free-tier budgets.

        Chain:
          1. RSS Podcast 2.0 namespace   — no key, no quota
          2. Listen Notes Search API     — ~100 req/month free
          3. Taddy GraphQL API           — ~1 000 req/month free
        """
        providers = [
            self._spotify_from_rss_namespace,
            self._spotify_from_listennotes,
            self._spotify_from_taddy,
        ]
        for fn in providers:
            try:
                result = fn(source, feed)
                if result:
                    print(f"    [platform] Spotify found via {fn.__name__}: {result}")
                    return result
            except Exception as e:
                print(f"    [platform] {fn.__name__} failed for {source.name}: {e}")
        return None

    @staticmethod
    def _spotify_from_rss_namespace(source, feed) -> str | None:
        """Podcast 2.0: <podcast:id platform="spotify" url="...">"""
        for key in ("podcast_id", "podcast_guid"):
            val = feed.feed.get(key)
            if not val:
                continue
            for item in (val if isinstance(val, list) else [val]):
                if isinstance(item, dict) and item.get("platform") == "spotify":
                    url = item.get("url") or item.get("href")
                    if url:
                        return url
        return None

    @staticmethod
    def _spotify_from_listennotes(source, feed) -> str | None:
        """
        Listen Notes Search API — free tier ~100 req/month.
        https://www.listennotes.com/api/docs/
        Env: LISTEN_NOTES_API_KEY
        """
        from worker.config.settings import LISTEN_NOTES_API_KEY
        if not LISTEN_NOTES_API_KEY:
            return None

        query = urllib.parse.quote(source.name)
        url = f"https://listen-api.listennotes.com/api/v2/search?q={query}&type=podcast&limit=10"
        req = urllib.request.Request(url, headers={
            "X-ListenAPI-Key": LISTEN_NOTES_API_KEY,
            "User-Agent": "PodcastInsights/1.0",
        })
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 429:
                raise RuntimeError("Listen Notes rate limit reached")
            data = _json.loads(resp.read())

        feed_url = source.url.rstrip("/")
        results = data.get("results", [])
        # Prefer exact RSS feed URL match
        for r in results:
            if r.get("rss", "").rstrip("/") == feed_url:
                spotify = (r.get("extra") or {}).get("spotify_url") or r.get("spotify_url")
                if spotify:
                    return spotify
        # Fall back to first result's Spotify URL
        if results:
            r = results[0]
            return (r.get("extra") or {}).get("spotify_url") or r.get("spotify_url")
        return None

    @staticmethod
    def _spotify_from_taddy(source, feed) -> str | None:
        """
        Taddy GraphQL API — free tier ~1 000 req/month.
        https://taddy.org/developers/podcast-api
        Env: TADDY_API_KEY, TADDY_USER_ID
        """
        from worker.config.settings import TADDY_API_KEY, TADDY_USER_ID
        if not TADDY_API_KEY or not TADDY_USER_ID:
            return None

        query = '{ getPodcastSeries(rssUrl: "%s") { spotifyId } }' % source.url.replace('"', '\\"')
        payload = _json.dumps({"query": query}).encode()
        req = urllib.request.Request(
            "https://api.taddy.org",
            data=payload,
            headers={
                "Content-Type": "application/json",
                "X-API-KEY": TADDY_API_KEY,
                "X-USER-ID": TADDY_USER_ID,
                "User-Agent": "PodcastInsights/1.0",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 429:
                raise RuntimeError("Taddy rate limit reached")
            data = _json.loads(resp.read())

        spotify_id = (
            data.get("data", {})
                .get("getPodcastSeries", {})
                .get("spotifyId")
        )
        if spotify_id:
            return f"https://open.spotify.com/show/{spotify_id}"
        return None

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_podcast_transcript_url(entry) -> str | None:
        """Parse <podcast:transcript> from a feedparser entry."""
        if entry is None:
            return None

        # feedparser exposes custom namespace tags under various keys
        # Try the namespaced attribute directly
        for key in dir(entry) if hasattr(entry, "__iter__") else []:
            pass  # feedparser doesn't expose namespace attrs via dir()

        # feedparser stores podcast namespace as tags[podcast_transcript] or similar
        # Most reliable: check entry.get with various key patterns
        for attr in ("podcast_transcript", "transcript"):
            val = entry.get(attr)
            if val:
                if isinstance(val, list):
                    val = val[0]
                if isinstance(val, dict):
                    url = val.get("url") or val.get("href")
                    mime = val.get("type", "")
                    if url and (not mime or mime in _TEXT_MIME_TYPES):
                        return url
                elif isinstance(val, str) and val.startswith("http"):
                    return val

        # Also check links array for transcript rel
        for link in entry.get("links", []):
            rel = link.get("rel", "")
            mime = link.get("type", "")
            href = link.get("href", "")
            if rel == "transcript" or (href and mime in _TEXT_MIME_TYPES):
                return href

        return None

    @staticmethod
    def _download_transcript_url(url: str) -> str | None:
        """Download a transcript URL and convert to plain text."""
        try:
            resp = requests.get(url, timeout=30, headers={"User-Agent": "PodcastInsights/1.0"})
            resp.raise_for_status()
            mime = resp.headers.get("Content-Type", "").split(";")[0].strip()
            return detect_and_convert(resp.text, mime)
        except Exception as e:
            print(f"    [transcript] Failed to fetch {url}: {e}")
            return None

    @staticmethod
    def _extract_audio_url(entry) -> str | None:
        for link in entry.get("links", []):
            if link.get("type", "").startswith("audio/"):
                return link["href"]
        for enc in entry.get("enclosures", []):
            if "audio" in enc.get("type", ""):
                return enc.get("url") or enc.get("href")
        return None

    @staticmethod
    def _parse_date(entry) -> datetime:
        for field in ("published", "updated"):
            val = entry.get(field)
            if val:
                try:
                    dt = parsedate_to_datetime(val)
                    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
                except Exception:
                    pass
        return datetime.now(timezone.utc)

    @staticmethod
    def _parse_duration(entry) -> int:
        itunes = entry.get("itunes_duration", "")
        if not itunes:
            return 0
        parts = str(itunes).split(":")
        try:
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            if len(parts) == 2:
                return int(parts[0]) * 60 + int(parts[1])
            return int(parts[0])
        except ValueError:
            return 0
