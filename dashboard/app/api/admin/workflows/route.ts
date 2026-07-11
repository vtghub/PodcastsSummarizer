import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

const GH_TOKEN = process.env.GH_TOKEN;
const GH_OWNER = process.env.GH_OWNER ?? "vtghub";
const GH_REPO  = process.env.GH_REPO  ?? "PodcastsSummarizer";

const GH_HEADERS = {
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github.v3+json",
  "Content-Type": "application/json",
};

interface GhWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
  html_url: string;
}

interface GhRun {
  id: number;
  status: string;      // queued | in_progress | completed | waiting
  conclusion: string | null; // success | failure | cancelled | ... | null while not completed
  created_at: string;
  html_url: string;
  event: string; // "schedule" | "workflow_dispatch" | ...
}

/**
 * All GitHub Actions workflows in this repo, each with its own most recent
 * run — powers the "Runners" section on /admin/task-status so an admin can
 * see and manually trigger any scheduled job, not just the insight backfill.
 */
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!GH_TOKEN) {
    return NextResponse.json({ error: "Not configured (GH_TOKEN missing)" }, { status: 503 });
  }

  const workflowsRes = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows`,
    { headers: GH_HEADERS, next: { revalidate: 0 } }
  );
  if (!workflowsRes.ok) {
    return NextResponse.json({ error: "Failed to list workflows" }, { status: 502 });
  }
  const { workflows } = (await workflowsRes.json()) as { workflows: GhWorkflow[] };

  const withRuns = await Promise.all(
    workflows.map(async (wf) => {
      const runsRes = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${wf.id}/runs?per_page=1`,
        { headers: GH_HEADERS, next: { revalidate: 0 } }
      );
      const runsData = runsRes.ok ? ((await runsRes.json()) as { workflow_runs: GhRun[] }) : { workflow_runs: [] };
      const latestRun = runsData.workflow_runs[0] ?? null;
      return {
        id: wf.id,
        name: wf.name,
        fileName: wf.path.split("/").pop() ?? "",
        state: wf.state,
        htmlUrl: wf.html_url,
        latestRun: latestRun
          ? {
              id: latestRun.id,
              status: latestRun.status,
              conclusion: latestRun.conclusion,
              createdAt: latestRun.created_at,
              htmlUrl: latestRun.html_url,
              event: latestRun.event,
            }
          : null,
      };
    })
  );

  withRuns.sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ workflows: withRuns });
}

/**
 * { action: "dispatch", fileName } — triggers workflow_dispatch with no inputs
 * (every scheduled workflow in this repo defines safe defaults for all its
 * inputs, so triggering with none is equivalent to a normal scheduled run).
 * { action: "cancel", runId } — cancels a queued/in_progress run.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!GH_TOKEN) {
    return NextResponse.json({ error: "Not configured (GH_TOKEN missing)" }, { status: 503 });
  }

  let body: { action?: string; fileName?: string; runId?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.action === "dispatch") {
    if (!body.fileName) return NextResponse.json({ error: "fileName required" }, { status: 400 });
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${body.fileName}/dispatches`,
      { method: "POST", headers: GH_HEADERS, body: JSON.stringify({ ref: "main", inputs: {} }) }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error("[admin/workflows] dispatch failed:", txt);
      return NextResponse.json({ error: "Failed to trigger workflow" }, { status: 502 });
    }
    return NextResponse.json({ queued: true });
  }

  if (body.action === "cancel") {
    if (!body.runId) return NextResponse.json({ error: "runId required" }, { status: 400 });
    const res = await fetch(
      `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/runs/${body.runId}/cancel`,
      { method: "POST", headers: GH_HEADERS }
    );
    if (!res.ok) {
      const txt = await res.text();
      console.error("[admin/workflows] cancel failed:", txt);
      return NextResponse.json({ error: "Failed to cancel run" }, { status: 502 });
    }
    return NextResponse.json({ cancelled: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
