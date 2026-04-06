/**
 * Simple in-memory rate limiter using a sliding window.
 * For cloud deployments, this limits per-instance (serverless functions don't share memory).
 * For self-hosted, it limits per-process.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(
      (t) => now - t < 60_000
    );
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}, 60_000);

/**
 * Check rate limit for a given key.
 * @param key - Unique identifier (e.g., userId, IP)
 * @param maxRequests - Maximum requests in the window
 * @param windowMs - Window size in milliseconds (default: 60s)
 * @returns { allowed, remaining, resetMs }
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const resetMs = oldest + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    resetMs: 0,
  };
}
