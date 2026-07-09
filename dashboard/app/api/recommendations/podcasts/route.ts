import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getSourcesAsync, type Source } from "@/lib/db";
import type { PodcastSearchResult } from "@/app/api/podcasts/search/route";

const DOMAIN_KEYWORDS: Record<string, string> = {
  "Technology & AI": "artificial intelligence technology",
  "Business & Startups": "business startup entrepreneurship",
  "Health & Science": "health science medicine",
  "Finance & Investing": "finance investing personal finance",
  "Leadership & Productivity": "leadership productivity self improvement",
  "Society & Culture": "society culture news commentary",
  "General": "top podcasts general",
  "Other": "podcast",
};

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const domainsParam = req.nextUrl.searchParams.get("domains");
  if (!domainsParam) return NextResponse.json({ catalog: [], suggestions: [] });

  const domains = domainsParam.split(",").map((d) => d.trim()).filter(Boolean);
  if (domains.length === 0) return NextResponse.json({ catalog: [], suggestions: [] });

  // Catalog: sources in the selected domains
  let catalog: Source[] = [];
  try {
    const all = await getSourcesAsync();
    catalog = all.filter((s) => domains.includes(s.domain) && !s.deleted);
  } catch {
    catalog = [];
  }

  const catalogFeedUrls = new Set(catalog.map((s) => s.url));

  // Suggestions: iTunes search for each domain, deduplicated against catalog
  const suggestions: PodcastSearchResult[] = [];
  const seenIds = new Set<number>();

  await Promise.allSettled(
    domains.map(async (domain) => {
      const keyword = DOMAIN_KEYWORDS[domain] ?? domain;
      const url = `https://itunes.apple.com/search?media=podcast&term=${encodeURIComponent(keyword)}&limit=8&entity=podcast`;
      try {
        const res = await fetch(url, { next: { revalidate: 300 } });
        if (!res.ok) return;
        const data = await res.json();
        for (const r of data.results ?? []) {
          if (!r.feedUrl) continue;
          if (catalogFeedUrls.has(r.feedUrl)) continue;
          if (seenIds.has(r.trackId)) continue;
          seenIds.add(r.trackId);
          suggestions.push({
            id: r.trackId,
            name: r.trackName,
            feedUrl: r.feedUrl,
            artworkUrl: r.artworkUrl100 ?? "",
            publisher: r.collectionName ?? r.artistName ?? "",
          });
        }
      } catch {
        // ignore individual domain fetch failures
      }
    })
  );

  return NextResponse.json({ catalog, suggestions });
}
