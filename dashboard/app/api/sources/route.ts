import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { addSourceAsync } from "@/lib/db";

const DOMAINS = [
  "Technology & AI",
  "Business & Startups",
  "Health & Science",
  "Finance & Investing",
  "Leadership & Productivity",
  "Society & Culture",
  "Other",
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, url, source_type, domain } = body;

    if (!name?.trim() || !url?.trim() || !domain?.trim()) {
      return NextResponse.json({ error: "name, url and domain are required" }, { status: 400 });
    }
    if (!["rss", "youtube"].includes(source_type)) {
      return NextResponse.json({ error: "source_type must be rss or youtube" }, { status: 400 });
    }
    if (!DOMAINS.includes(domain)) {
      return NextResponse.json({ error: "invalid domain" }, { status: 400 });
    }

    const id = randomBytes(6).toString("hex");
    await addSourceAsync({ id, name: name.trim(), url: url.trim(), source_type, domain });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
