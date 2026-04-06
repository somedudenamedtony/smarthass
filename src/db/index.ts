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

export const db = createDb();
