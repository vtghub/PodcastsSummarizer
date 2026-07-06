import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const GH_TOKEN   = process.env.GH_TOKEN;
const GH_OWNER   = process.env.GH_OWNER   ?? "vtghub";
const GH_REPO    = process.env.GH_REPO    ?? "PodcastsSummarizer";
const WORKFLOW   = "daily_pipeline.yml";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!GH_TOKEN)
    return NextResponse.json({ error: "Processing not configured (GH_TOKEN missing)" }, { status: 503 });

  const { sourceId, audioUrl, episodeTitle } = await req.json();
  if (!sourceId || !audioUrl)
    return NextResponse.json({ error: "sourceId and audioUrl required" }, { status: 400 });

  // Verify the user subscribes to this source
  const sb = getSupabaseClient();
  const { data: sub } = await sb
    .from("user_subscriptions")
    .select("source_id")
    .eq("user_id", user.id)
    .eq("source_id", sourceId)
    .maybeSingle();
  if (!sub)
    return NextResponse.json({ error: "Not subscribed to this source" }, { status: 403 });

  // Trigger GitHub Actions workflow_dispatch
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main",
        inputs: {
          episode_audio_url: audioUrl,
          source_id: sourceId,
          target_email: user.email ?? "",
        },
      }),
    }
  );

  if (!dispatchRes.ok) {
    const txt = await dispatchRes.text();
    console.error("[process] workflow_dispatch failed:", txt);
    return NextResponse.json({ error: "Failed to queue processing" }, { status: 502 });
  }

  return NextResponse.json({
    queued: true,
    episodeTitle: episodeTitle ?? "Selected episode",
    message: "Processing started — you'll receive an email digest in 3–5 minutes.",
  });
}
