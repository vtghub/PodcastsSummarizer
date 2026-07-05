import { NextResponse } from "next/server";
import { SESSION_COOKIE, COOKIE_MAX_AGE, hashSecret } from "@/lib/auth";

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({}));
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }
  if (!passcode || passcode !== secret) {
    return NextResponse.json({ error: "Invalid passcode" }, { status: 401 });
  }

  const hash = await hashSecret(secret);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, hash, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
