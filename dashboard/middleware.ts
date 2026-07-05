import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const cookieVal = req.cookies.get(SESSION_COOKIE)?.value;
  const authed = await isValidSession(cookieVal);

  if (!authed) {
    // API routes → 401 JSON
    if (pathname.startsWith("/api/sources")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Pages → redirect to login with return path
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/podcasts/:path*", "/api/sources/:path*"],
};
