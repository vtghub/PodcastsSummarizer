import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getAvailableDates, getInsightsByDate } from "@/lib/db";
import { buildDigestHtml } from "@/lib/email";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dates = await getAvailableDates(user.id);
  if (dates.length === 0)
    return NextResponse.json({ error: "No insights available" }, { status: 404 });

  const date = dates[0];
  const insights = await getInsightsByDate(date, user.id);
  if (insights.length === 0)
    return NextResponse.json({ error: "No insights for your subscriptions" }, { status: 404 });

  const byDomain: Record<string, typeof insights> = {};
  for (const ins of insights) (byDomain[ins.domain] ??= []).push(ins);

  const html = buildDigestHtml(date, byDomain);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
