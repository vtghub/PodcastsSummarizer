import { NextRequest, NextResponse } from "next/server";
import { deleteSourceAsync, setSourceEnabledAsync, setSourceDomainAsync } from "@/lib/db";
import { isAdmin } from "@/lib/auth";
import { DOMAINS as DOMAIN_ORDER } from "@/lib/domain-colors";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteSourceAsync(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { id } = await params;
    const body = await req.json();

    if ("enabled" in body) {
      if (typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
      }
      await setSourceEnabledAsync(id, body.enabled);
      return NextResponse.json({ ok: true });
    }

    if ("domain" in body) {
      if (!DOMAIN_ORDER.includes(body.domain)) {
        return NextResponse.json({ error: "invalid domain" }, { status: 400 });
      }
      await setSourceDomainAsync(id, body.domain);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "enabled or domain is required" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
