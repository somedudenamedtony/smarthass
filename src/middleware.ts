import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * In HA add-on mode (DEPLOY_MODE=home-assistant), skip NextAuth entirely.
 * All requests are trusted since Supervisor/Ingress handles authentication.
 */
function isHomeAssistantMode() {
  return process.env.DEPLOY_MODE === "home-assistant";
}

export default async function middleware(request: NextRequest) {
  if (isHomeAssistantMode()) {
    // Trust HA Supervisor — allow all requests without session checks
    return NextResponse.next();
  }

  // Cloud / self-hosted: use NextAuth session middleware
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(request);
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
