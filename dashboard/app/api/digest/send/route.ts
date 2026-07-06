import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { getAvailableDates, getInsightsByDate } from "@/lib/db";
import { sendDigestEmail } from "@/lib/email";

export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dates = await getAvailableDates(user.id);
  if (dates.length === 0) return NextResponse.json({ error: "No insights available" }, { status: 404 });

  const date = dates[0];
  const insights = await getInsightsByDate(date, user.id);
  if (insights.length === 0) {
    return NextResponse.json(
      { error: "No insights found for your subscribed podcasts" },
      { status: 404 },
    );
  }

  const byDomain: Record<string, typeof insights> = {};
  for (const ins of insights) {
    (byDomain[ins.domain] ??= []).push(ins);
  }

  await sendDigestEmail(user.email!, date, byDomain);

  return NextResponse.json({ ok: true, date, count: insights.length });
}
