import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isSelfHosted, isCloud, isHomeAssistant, features } from "@/lib/config";
import { authConfig } from "@/auth.config";

function getProviders() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providers: any[] = [];

  // HA add-on mode: no auth providers needed (Supervisor handles auth)
  if (isHomeAssistant()) return providers;

  if (isCloud()) {
    if (process.env.AUTH_GITHUB_ID) {
      providers.push(GitHub);
    }
    if (process.env.AUTH_GOOGLE_ID) {
      providers.push(Google);
    }
  }

  if (features.credentialsAuth) {
    providers.push(
      Credentials({
        name: "credentials",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          if (!credentials?.email || !credentials?.password) return null;

          const email = credentials.email as string;
          const password = credentials.password as string;

          const user = await db
            .select()
            .from(schema.users)
            .where(eq(schema.users.email, email))
            .limit(1);

          if (!user[0]?.passwordHash) return null;

          const valid = await bcrypt.compare(password, user[0].passwordHash);
          if (!valid) return null;

          return {
            id: user[0].id,
            name: user[0].name,
            email: user[0].email,
            image: user[0].image,
          };
        },
      })
    );
  }

  return providers;
}

const { handlers, auth: _nextAuth, signIn, signOut } = NextAuth({
  ...authConfig,
  // In HA mode the adapter is unused (no providers / no DB sessions).
  // Skip it so the DrizzleAdapter never inspects the lazy-proxy db object
  // at build time ("Unsupported database type" error).
  ...(isHomeAssistant()
    ? {}
    : {
        adapter: DrizzleAdapter(db, {
          usersTable: schema.users,
          accountsTable: schema.accounts,
          sessionsTable: schema.sessions,
          verificationTokensTable: schema.verificationTokens,
        }),
      }),
  providers: getProviders(),
  session: {
    strategy: isSelfHosted() ? "jwt" : "database",
  },
});

/**
 * Wrapped auth() that returns a valid session in HA add-on mode
 * by looking up the admin user from the database.
 * All other modes delegate to NextAuth normally.
 */
async function auth() {
  if (isHomeAssistant()) {
    try {
      const [user] = await db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
        })
        .from(schema.users)
        .limit(1);

      if (user) {
        return {
          user: {
            id: user.id,
            name: user.name ?? undefined,
            email: user.email ?? undefined,
          },
          expires: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString(),
        };
      }
    } catch {
      // DB not available (e.g. build-time static page generation) — return null
      // so the dashboard layout redirects to /setup gracefully
    }
    return null;
  }
  return _nextAuth();
}

export { handlers, auth, signIn, signOut };
