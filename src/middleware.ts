import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public routes — don't require auth
  const publicPaths = ["/", "/login", "/setup", "/api/setup"];
  if (publicPaths.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // API auth routes are handled by NextAuth
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Cron endpoints use their own secret-based auth
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  // Everything else requires authentication
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
