import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getSupabaseClient } from "@/lib/supabase";

const GH_TOKEN = process.env.GH_TOKEN;
const GH_OWNER = process.env.GH_OWNER ?? "vtghub";
const GH_REPO  = process.env.GH_REPO  ?? "PodcastsSummarizer";
const WORKFLOW = "backfill_insights.yml";
const JOB_TYPE = "insight_reextraction";

/**
 * Status for the /admin/task-status page — the current (or most recent)
 * insight-reextraction backfill job plus its most recent failures. The job
 * itself is processed by worker/jobs/backfill_insights.py, one bounded batch
 * per invocation (scheduled daily + manually triggerable below), resuming
 * via a cursor stored on the job row — see migration 020.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sb = getSupabaseClient();

  // Current total insight count — lets the UI estimate the orchestration
  // (how many batches / days) for a *new* job before one has ever run, and
  // stays accurate afterward since new episodes keep landing while a
  // multi-day backfill is in progress.
  const { count: currentTotalInsights } = await sb
    .from("insights")
    .select("id", { count: "exact", head: true });

  const { data: job, error: jobError } = await sb
    .from("backfill_jobs")
    .select("*")
    .eq("job_type", JOB_TYPE)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (jobError) {
    // Table may not exist yet if migration 020 hasn't been run.
    console.error("[admin/backfill] failed to read backfill_jobs:", jobError.message);
    return NextResponse.json({ job: null, failures: [], currentTotalInsights: currentTotalInsights ?? null });
  }

  let failures: unknown[] = [];
  if (job) {
    const { data: failureRows } = await sb
      .from("backfill_failures")
      .select("*")
      .eq("job_id", job.id)
      .order("failed_at", { ascending: false })
      .limit(20);
    failures = failureRows ?? [];
  }

  return NextResponse.json({ job, failures, currentTotalInsights: currentTotalInsights ?? null });
}

/** Manually trigger one backfill batch immediately, instead of waiting for the daily cron. */
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
    console.error("[admin/backfill] workflow_dispatch failed:", txt);
    return NextResponse.json({ error: "Failed to queue backfill batch" }, { status: 502 });
  }

  return NextResponse.json({ queued: true });
}
