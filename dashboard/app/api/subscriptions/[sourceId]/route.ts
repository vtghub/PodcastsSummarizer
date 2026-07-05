import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { unsubscribeFromSource } from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sourceId } = await params;
  await unsubscribeFromSource(userId, sourceId);
  return NextResponse.json({ ok: true });
}
