/**
 * Database-backed rate limiter using a sliding window.
 * Persists across serverless instances (cloud) and process restarts (self-hosted).
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * Check rate limit for a given key.
 * Uses a Postgres row per key with a JSONB array of timestamps.
 * @param key - Unique identifier (e.g., userId, IP)
 * @param maxRequests - Maximum requests in the window
 * @param windowMs - Window size in milliseconds (default: 60s)
 * @returns { allowed, remaining, resetMs }
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): Promise<{ allowed: boolean; remaining: number; resetMs: number }> {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Atomic upsert: insert or update the row, pruning old timestamps in the same query
  const result = await db.execute<{
    timestamps: number[];
  }>(sql`
    INSERT INTO rate_limit_entries (key, timestamps, updated_at)
    VALUES (${key}, ${JSON.stringify([now])}::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      timestamps = (
        SELECT jsonb_agg(ts)
        FROM jsonb_array_elements_text(rate_limit_entries.timestamps) AS ts
        WHERE ts::bigint > ${cutoff}
      ),
      updated_at = NOW()
    RETURNING timestamps
  `);

  const timestamps: number[] = (result.rows[0]?.timestamps ?? []).map(Number);

  if (timestamps.length >= maxRequests) {
    const oldest = Math.min(...timestamps);
    const resetMs = oldest + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetMs: Math.max(0, resetMs),
    };
  }

  // Add the current timestamp
  await db.execute(sql`
    UPDATE rate_limit_entries
    SET timestamps = timestamps || ${JSON.stringify([now])}::jsonb,
        updated_at = NOW()
    WHERE key = ${key}
  `);

  return {
    allowed: true,
    remaining: maxRequests - timestamps.length - 1,
    resetMs: 0,
  };
}
