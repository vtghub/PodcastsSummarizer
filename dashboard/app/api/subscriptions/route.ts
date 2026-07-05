import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { getUserSubscriptions, subscribeToSource } from "@/lib/db";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sourceIds = await getUserSubscriptions(userId);
  return NextResponse.json({ sourceIds });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceId } = await req.json().catch(() => ({}));
  if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

  await subscribeToSource(userId, sourceId);
  return NextResponse.json({ ok: true });
}
