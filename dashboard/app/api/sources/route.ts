import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { addSourceAsync } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { DOMAINS as DOMAIN_ORDER } from "@/lib/domain-colors";

const GH_TOKEN = process.env.GH_TOKEN;
const GH_OWNER = process.env.GH_OWNER ?? "vtghub";
const GH_REPO  = process.env.GH_REPO  ?? "PodcastsSummarizer";
const BACKFILL_WORKFLOW = "backfill_platform_links.yml";

async function triggerBackfill(sourceId: string) {
  if (!GH_TOKEN) return;
  try {
    await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${BACKFILL_WORKFLOW}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GH_TOKEN}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { source_id: sourceId } }),
      }
    );
  } catch {
    // fire-and-forget — don't fail the add if backfill dispatch errors
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const { name, url, source_type, domain } = body;

    if (!name?.trim() || !url?.trim() || !domain?.trim()) {
      return NextResponse.json({ error: "name, url and domain are required" }, { status: 400 });
    }
    if (!["rss", "youtube"].includes(source_type)) {
      return NextResponse.json({ error: "source_type must be rss or youtube" }, { status: 400 });
    }
    if (!DOMAIN_ORDER.includes(domain)) {
      return NextResponse.json({ error: "invalid domain" }, { status: 400 });
    }

    const id = randomBytes(6).toString("hex");
    await addSourceAsync({ id, name: name.trim(), url: url.trim(), source_type, domain });

    // Fire-and-forget: backfill platform links (Apple, Website, etc.) for this new source
    triggerBackfill(id);

    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
