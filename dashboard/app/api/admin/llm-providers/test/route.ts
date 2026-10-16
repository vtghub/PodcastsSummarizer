import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { probeLadder } from "@/lib/llm-waterfall";

// The probe fans out to every slot in parallel and waits for the slowest
// (some free models take 10–30s); each slot has its own 40s timeout inside
// probeLadder(), so allow the route the full minute.
export const maxDuration = 60;

// POST rather than GET: it spends a little free-tier quota per call, so it
// must never be triggered by a link prefetch, crawler or accidental reload.
export async function POST() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results = await probeLadder();
  return NextResponse.json({ results, tested_at: new Date().toISOString() });
}
