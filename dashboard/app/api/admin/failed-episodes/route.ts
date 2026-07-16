import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const GH_TOKEN = process.env.GH_TOKEN;
const GH_OWNER = process.env.GH_OWNER ?? "vtghub";
const GH_REPO  = process.env.GH_REPO  ?? "PodcastsSummarizer";
const WORKFLOW = "retry_failed_episodes.yml";
const LIST_LIMIT = 30;

interface QueueRow {
  episode_id: string;
  source_id: string;
  error_msg: string | null;
  retry_count: number;
  updated_at: string;
}

/**
 * Episodes currently stuck in episode_queue with status='failed' — mostly
 * LLM/chunk failures where every waterfall provider was exhausted for that
 * run (see worker/jobs/pipeline.py's all_providers_dead short-circuit and
 * worker/jobs/retry_failed_episodes.py, which this page's "Retry now" button
 * dispatches on demand). A row here resolves itself (flips to 'done') the
 * next time that episode succeeds, whether via the in-band pipeline retry or
 * this dedicated recovery job — see storage.mark_episode_queue_resolved().
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();

  const { data: rows, error } = await sb
    .from("episode_queue")
    .select("episode_id, source_id, error_msg, retry_count, updated_at")
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    console.error("[admin/failed-episodes] failed to read episode_queue:", error.message);
    return NextResponse.json({ episodes: [] });
  }

  const queueRows = (rows ?? []) as QueueRow[];
  const episodeIds = queueRows.map((r) => r.episode_id);
  const sourceIds = [...new Set(queueRows.map((r) => r.source_id))];

  const [{ data: episodesData }, { data: sourcesData }] = await Promise.all([
    episodeIds.length > 0
      ? sb.from("episodes").select("id, title, title_en").in("id", episodeIds)
      : Promise.resolve({ data: [] as { id: string; title: string; title_en: string | null }[] }),
    sourceIds.length > 0
      ? sb.from("sources").select("id, name").in("id", sourceIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const episodeTitleById = new Map((episodesData ?? []).map((e) => [e.id, e.title_en || e.title]));
  const sourceNameById = new Map((sourcesData ?? []).map((s) => [s.id, s.name]));

  const episodes = queueRows.map((r) => ({
    episodeId: r.episode_id,
    sourceId: r.source_id,
    episodeTitle: episodeTitleById.get(r.episode_id) ?? r.episode_id,
    sourceName: sourceNameById.get(r.source_id) ?? "Unknown source",
    retryCount: r.retry_count,
    errorMsg: r.error_msg,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({ episodes });
}

/**
 * Manually trigger the retry workflow immediately, instead of waiting for
 * its next scheduled run.
 */
export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!GH_TOKEN) {
    return NextResponse.json({ error: "Not configured (GH_TOKEN missing)" }, { status: 503 });
  }

  const dispatchRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: {} }),
    }
  );

  if (!dispatchRes.ok) {
    const txt = await dispatchRes.text();
    console.error("[admin/failed-episodes] workflow_dispatch failed:", txt);
    return NextResponse.json({ error: "Failed to queue retry run" }, { status: 502 });
  }

  return NextResponse.json({ queued: true });
}
