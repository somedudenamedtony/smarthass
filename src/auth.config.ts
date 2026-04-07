import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config used by middleware.
 * Does NOT import any Node.js-only modules (bcrypt, drizzle, pg, crypto).
 * Full providers and adapter are added in auth.ts.
 */

function isHAMode() {
  return process.env.DEPLOY_MODE === "home-assistant";
}

export const authConfig = {
  pages: {
    signIn: isHAMode() ? "/dashboard" : "/login",
  },
  providers: [], // Populated in auth.ts — kept empty here for Edge compatibility
  callbacks: {
    async session({ session, token, user }) {
      if (token?.sub) {
        session.user.id = token.sub;
      } else if (user?.id) {
        session.user.id = user.id;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    authorized({ auth, request: { nextUrl } }) {
      // HA add-on mode: all requests are trusted (Supervisor handles auth)
      if (isHAMode()) return true;

      const { pathname } = nextUrl;

      // Public routes
      const publicPaths = ["/", "/login", "/setup", "/api/setup"];
      if (publicPaths.some((p) => pathname === p)) return true;

      // NextAuth routes
      if (pathname.startsWith("/api/auth")) return true;

      // Cron endpoints use secret-based auth
      if (pathname.startsWith("/api/cron")) return true;

      // Everything else requires authentication
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
