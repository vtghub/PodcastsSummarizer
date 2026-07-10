import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getPublicSourcesAsync, getUserSubscriptions, subscribeToSource, unsubscribeFromSource } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const [sources, subscribedIds] = await Promise.all([
    getPublicSourcesAsync(),
    getUserSubscriptions(id),
  ]);

  return NextResponse.json({ sources, subscribedIds });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { sourceId } = await req.json().catch(() => ({}));
  if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

  await subscribeToSource(id, sourceId);
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const { sourceId } = await req.json().catch(() => ({}));
  if (!sourceId) return NextResponse.json({ error: "sourceId required" }, { status: 400 });

  await unsubscribeFromSource(id, sourceId);
  return NextResponse.json({ ok: true });
}
