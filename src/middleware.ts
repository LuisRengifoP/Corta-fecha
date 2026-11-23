import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./lib/session-token";

const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    /\.(?:svg|png|jpg|jpeg|gif|webp|ico)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (pathname === "/api/alerts/cron") {
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    if (cronSecret) {
      const authHeader = req.headers.get("authorization") || "";
      const bearer = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";
      const headerSecret = (req.headers.get("x-cron-secret") || "").trim();
      if (bearer === cronSecret || headerSecret === cronSecret) {
        return NextResponse.next();
      }
    }
  }

  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionToken(token);

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Sesión no iniciada o expirada" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
