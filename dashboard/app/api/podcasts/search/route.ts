import { NextRequest, NextResponse } from "next/server";

export interface PodcastSearchResult {
  id: number;
  name: string;
  feedUrl: string;
  artworkUrl: string;
  publisher: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json([]);

  const url = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(q)}&limit=10&entity=podcast`;
  const res = await fetch(url, { next: { revalidate: 60 } });
  if (!res.ok) return NextResponse.json([], { status: 502 });

  const data = await res.json();
  const results: PodcastSearchResult[] = (data.results ?? [])
    .filter((r: { feedUrl?: string }) => r.feedUrl)
    .map((r: { trackId: number; trackName: string; feedUrl: string; artworkUrl100: string; collectionName?: string; artistName?: string }) => ({
      id: r.trackId,
      name: r.trackName,
      feedUrl: r.feedUrl,
      artworkUrl: r.artworkUrl100 ?? "",
      publisher: r.collectionName ?? r.artistName ?? "",
    }));

  return NextResponse.json(results);
}
