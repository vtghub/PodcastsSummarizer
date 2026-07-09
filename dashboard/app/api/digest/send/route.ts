import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { getAvailableDates, getInsightsByDate, getInsightsByEpisode } from "@/lib/db";
import { sendDigestEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const episodeId: string | undefined = body?.episodeId;

    // ── Single-episode digest ─────────────────────────────────────────────────
    if (episodeId) {
      const insights = await getInsightsByEpisode(episodeId);
      if (insights.length === 0)
        return NextResponse.json({ error: "No insights found for this episode" }, { status: 404 });

      const date = insights[0].date;
      const byDomain: Record<string, typeof insights> = {};
      for (const ins of insights) (byDomain[ins.domain] ??= []).push(ins);

      await sendDigestEmail(user.email!, date, byDomain);
      revalidatePath("/dashboard");
      return NextResponse.json({ ok: true, date, count: insights.length });
    }

    // ── Full digest (most recent date for user's subscriptions) ───────────────
    const dates = await getAvailableDates(user.id);
    if (dates.length === 0)
      return NextResponse.json({ error: "No insights available" }, { status: 404 });

    const date = dates[0];
    const insights = await getInsightsByDate(date, user.id);
    if (insights.length === 0)
      return NextResponse.json(
        { error: "No insights found for your subscribed podcasts" }, { status: 404 }
      );

    const byDomain: Record<string, typeof insights> = {};
    for (const ins of insights) (byDomain[ins.domain] ??= []).push(ins);

    await sendDigestEmail(user.email!, date, byDomain);
    revalidatePath("/dashboard");
    return NextResponse.json({ ok: true, date, count: insights.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[digest/send]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
