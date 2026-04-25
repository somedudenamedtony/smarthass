import { drizzle } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { neon } from "@neondatabase/serverless";
import pg from "pg";
import * as schema from "./schema";

function createDb() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Use Neon HTTP driver for Neon databases, node-postgres for everything else
  if (databaseUrl.includes("neon.tech")) {
    const sql = neon(databaseUrl);
    return drizzle(sql, { schema });
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });
  return drizzlePg(pool, { schema });
}

// Lazy singleton — avoids crashing during Next.js build-time static page collection
// when DATABASE_URL is not yet available.
let _db: ReturnType<typeof createDb> | undefined;

function ensureDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    const real = ensureDb();
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? value.bind(real) : value;
  },
  // DrizzleAdapter uses drizzle-orm's is() which walks the prototype chain to
  // check entityKind. Delegate to the real instance so it passes the PgDatabase check.
  getPrototypeOf() {
    try {
      return Object.getPrototypeOf(ensureDb());
    } catch {
      // During build time DATABASE_URL may not be set — fall back to plain object proto
      return Object.prototype;
    }
  },
});
