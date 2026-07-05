import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookieVal = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await isValidSession(cookieVal);

  if (!authed && pathname.startsWith("/api/sources")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/sources/:path*"],
};
