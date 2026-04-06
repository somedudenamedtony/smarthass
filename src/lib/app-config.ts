import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./encryption";

/**
 * Get a configuration value. For secrets, decrypts automatically.
 * Falls back to the corresponding environment variable if not in DB.
 */
export async function getConfig(key: string): Promise<string | null> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, key))
    .limit(1);

  if (rows[0]) {
    return rows[0].isSecret ? decrypt(rows[0].value) : rows[0].value;
  }

  // Fallback to env var (e.g. key "anthropic_api_key" → ANTHROPIC_API_KEY)
  const envKey = key.toUpperCase();
  return process.env[envKey] ?? null;
}

/**
 * Set a configuration value. Secrets are encrypted before storage.
 */
export async function setConfig(
  key: string,
  value: string,
  isSecret = false
): Promise<void> {
  const storedValue = isSecret ? encrypt(value) : value;

  await db
    .insert(appConfig)
    .values({ key, value: storedValue, isSecret, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: storedValue, isSecret, updatedAt: new Date() },
    });
}

/**
 * Delete a configuration value.
 */
export async function deleteConfig(key: string): Promise<void> {
  await db.delete(appConfig).where(eq(appConfig.key, key));
}

/**
 * Check whether a config key has a value (in DB or env).
 */
export async function hasConfig(key: string): Promise<boolean> {
  const val = await getConfig(key);
  return val !== null && val !== "";
}

/**
 * Get the Anthropic API key from DB or env.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  return getConfig("ANTHROPIC_API_KEY");
}
