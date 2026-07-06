import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getUser } from "@/lib/auth";
import { getEpisodesWithInsights } from "@/lib/db";
import { getSupabaseClient } from "@/lib/supabase";
import type { EpisodeItem } from "@/lib/db";

// ── RSS helpers ────────────────────────────────────────────────────────────

interface RawRssEpisode {
  title: string;
  audioUrl: string;
  publishedAt: string;
  episodeId: string;
}

async function fetchRssEpisodes(feedUrl: string): Promise<RawRssEpisode[]> {
  const res = await fetch(feedUrl, {
    headers: { "User-Agent": "PodcastInsights/1.0" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();

  const results: RawRssEpisode[] = [];
  const itemPattern = /<item[\s>][\s\S]*?<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemPattern.exec(xml)) !== null) {
    const block = m[0];
    const title = extractCdata(block, "title");
    const pubDate = extractText(block, "pubDate");
    const audioUrl = extractEnclosureUrl(block);
    if (!title || !audioUrl) continue;
    const episodeId = createHash("md5").update(audioUrl).digest("hex");
    results.push({ title, audioUrl, publishedAt: pubDate, episodeId });
  }
  return results;
}

function extractCdata(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*?))<\\/${tag}>`, "i"
  );
  const m = xml.match(re);
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

function extractText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i"));
  return (m?.[1] ?? "").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractEnclosureUrl(itemXml: string): string | null {
  // Handles url/href in double or single quotes, type before or after url
  const patterns = [
    /enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']audio/i,
    /enclosure[^>]+type=["']audio[^>]+url=["']([^"']+)["']/i,
    /enclosure[^>]+href=["']([^"']+)["'][^>]*type=["']audio/i,
  ];
  for (const p of patterns) {
    const m = itemXml.match(p);
    if (m?.[1]) return decodeHtmlEntities(m[1]);
  }
  return null;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sourceId = req.nextUrl.searchParams.get("sourceId");
  if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

  const includeAll = req.nextUrl.searchParams.get("includeAll") === "true";

  // Verify subscription
  const sb = getSupabaseClient();
  const { data: sub } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", user.id)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (!sub) return NextResponse.json({ error: "Not subscribed to this source" }, { status: 403 });

  // Processed episodes (have insights in DB)
  const processed = await getEpisodesWithInsights(user.id, sourceId);
  const processedIds = new Set(processed.map((e) => e.id));

  if (!includeAll) {
    const episodes: EpisodeItem[] = processed.map((e) => ({
      id: e.id,
      title: e.title,
      publishedAt: e.published_at,
      audioUrl: "",
      processed: true,
    }));
    return NextResponse.json(episodes);
  }

  // Phase 2: fetch RSS to get all episodes, merge with processed set
  const { data: sourceRow } = await sb
    .from("sources")
    .select("url, source_type")
    .eq("id", sourceId)
    .single();

  if (!sourceRow || sourceRow.source_type !== "rss") {
    // YouTube sources: return only processed episodes
    const episodes: EpisodeItem[] = processed.map((e) => ({
      id: e.id, title: e.title, publishedAt: e.published_at, audioUrl: "", processed: true,
    }));
    return NextResponse.json(episodes);
  }

  let rssEpisodes: RawRssEpisode[] = [];
  try {
    rssEpisodes = await fetchRssEpisodes(sourceRow.url);
  } catch {
    // RSS fetch failed — fall back to processed-only
    const episodes: EpisodeItem[] = processed.map((e) => ({
      id: e.id, title: e.title, publishedAt: e.published_at, audioUrl: "", processed: true,
    }));
    return NextResponse.json(episodes);
  }

  const episodes: EpisodeItem[] = rssEpisodes.map((r) => ({
    id: r.episodeId,
    title: r.title,
    publishedAt: r.publishedAt,
    audioUrl: r.audioUrl,
    processed: processedIds.has(r.episodeId),
  }));

  return NextResponse.json(episodes);
}
