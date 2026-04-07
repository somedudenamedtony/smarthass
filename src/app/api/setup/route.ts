import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setupBodySchema, formatZodError } from "@/lib/validators";
import { setConfig } from "@/lib/app-config";
import { isHomeAssistant } from "@/lib/config";
import { encrypt } from "@/lib/encryption";
import { fullSync } from "@/lib/sync-service";
import { HAClient } from "@/lib/ha-client";

/**
 * GET /api/setup — check if setup is needed (no users exist)
 */
export async function GET() {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  return NextResponse.json({
    needsSetup: (result[0]?.count ?? 0) === 0,
    isHomeAssistant: isHomeAssistant(),
  });
}

/**
 * POST /api/setup — create the initial admin user (only works when no users exist)
 *
 * In HA add-on mode: auto-creates admin user + registers local HA instance.
 * Body (standard): { name, email, password }
 * Body (HA mode): {} (empty — everything is auto-configured)
 */
export async function POST(request: NextRequest) {
  // Only allow setup when no users exist
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  if ((result[0]?.count ?? 0) > 0) {
    return NextResponse.json(
      { error: "Setup already completed" },
      { status: 403 }
    );
  }

  // HA add-on mode: auto-configure everything
  if (isHomeAssistant()) {
    return handleHASetup();
  }

  // Standard self-hosted / cloud setup
  const raw = await request.json();
  const parsed = setupBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { name, email, password, anthropicKey } = parsed.data;

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await db
    .insert(schema.users)
    .values({
      name: name || "Admin",
      email,
      passwordHash,
    })
    .returning();

  // Save Anthropic API key to app_config if provided
  if (anthropicKey) {
    await setConfig("ANTHROPIC_API_KEY", anthropicKey, true);
  }

  return NextResponse.json({
    success: true,
    user: { id: newUser[0].id, name: newUser[0].name, email: newUser[0].email },
  });
}

/**
 * Auto-setup for HA add-on mode:
 * 1. Create admin user with random credentials
 * 2. Register local HA instance using Supervisor token
 * 3. Save Anthropic API key if provided via add-on config
 * 4. Run initial sync
 */
async function handleHASetup() {
  try {
    // 1. Create admin user
    const randomPassword = require("crypto").randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const newUser = await db
      .insert(schema.users)
      .values({
        name: "Admin",
        email: "admin@smarthass.local",
        passwordHash,
      })
      .returning();

    const userId = newUser[0].id;

    // 2. Register local HA instance via Supervisor
    const supervisorToken = process.env.SUPERVISOR_TOKEN;
    const haUrl = "http://supervisor/core";

    if (supervisorToken) {
      // Encrypt the supervisor token for storage
      const encryptedToken = encrypt(supervisorToken);

      // Health check via Supervisor API
      let haVersion: string | null = null;
      try {
        const client = HAClient.fromSupervisor();
        const health = await client.healthCheck();
        if (health.version) {
          haVersion = health.version;
        }
      } catch {
        console.warn("[setup] HA health check failed, continuing anyway");
      }

      const instance = await db
        .insert(schema.haInstances)
        .values({
          userId,
          name: "Home Assistant",
          url: haUrl,
          encryptedToken,
          status: haVersion ? "connected" : "pending",
          haVersion,
        })
        .returning();

      // 3. Run initial sync if connected
      if (haVersion && instance[0]) {
        try {
          const client = HAClient.fromSupervisor();
          await fullSync(instance[0].id, client);
          console.log("[setup] Initial sync completed");
        } catch (err) {
          console.error("[setup] Initial sync failed:", err);
        }
      }
    }

    // 4. Save Anthropic API key if provided via environment
    if (process.env.ANTHROPIC_API_KEY) {
      await setConfig("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY, true);
    }

    return NextResponse.json({
      success: true,
      user: { id: userId, name: "Admin", email: "admin@smarthass.local" },
      mode: "home-assistant",
    });
  } catch (error) {
    console.error("[setup] HA auto-setup failed:", error);
    return NextResponse.json(
      { error: "Auto-setup failed" },
      { status: 500 }
    );
  }
}
