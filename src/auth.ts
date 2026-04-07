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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: getProviders(),
  session: {
    strategy: isSelfHosted() ? "jwt" : "database",
  },
});
