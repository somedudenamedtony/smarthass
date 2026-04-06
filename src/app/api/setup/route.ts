import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { setupBodySchema, formatZodError } from "@/lib/validators";
import { setConfig } from "@/lib/app-config";

/**
 * GET /api/setup — check if setup is needed (no users exist)
 */
export async function GET() {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);

  return NextResponse.json({
    needsSetup: (result[0]?.count ?? 0) === 0,
  });
}

/**
 * POST /api/setup — create the initial admin user (only works when no users exist)
 * Body: { name, email, password }
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
