import { db } from "@/db";
import * as schema from "@/db/schema";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

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

  const { name, email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  if (typeof password !== "string" || password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await db
    .insert(schema.users)
    .values({
      name: name || "Admin",
      email,
      passwordHash,
    })
    .returning();

  return NextResponse.json({
    success: true,
    user: { id: newUser[0].id, name: newUser[0].name, email: newUser[0].email },
  });
}
