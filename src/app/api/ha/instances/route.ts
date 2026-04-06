import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@/lib/encryption";
import { HAClient } from "@/lib/ha-client";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/ha/instances — list all instances for the current user */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instances = await db
    .select({
      id: schema.haInstances.id,
      name: schema.haInstances.name,
      url: schema.haInstances.url,
      status: schema.haInstances.status,
      haVersion: schema.haInstances.haVersion,
      lastSyncAt: schema.haInstances.lastSyncAt,
      analysisWindowDays: schema.haInstances.analysisWindowDays,
      createdAt: schema.haInstances.createdAt,
    })
    .from(schema.haInstances)
    .where(eq(schema.haInstances.userId, session.user.id));

  return NextResponse.json(instances);
}

/** POST /api/ha/instances — create a new HA instance connection */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, url, token } = body as {
    name?: string;
    url?: string;
    token?: string;
  };

  if (!name || !url || !token) {
    return NextResponse.json(
      { error: "name, url, and token are required" },
      { status: 400 }
    );
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  // Encrypt the token
  const encryptedToken = encrypt(token);

  // Test connection before saving
  const client = new HAClient(url, encryptedToken);
  const health = await client.healthCheck();

  const status = health.ok ? "connected" : "error";

  const [instance] = await db
    .insert(schema.haInstances)
    .values({
      userId: session.user.id,
      name,
      url: url.replace(/\/+$/, ""),
      encryptedToken,
      status,
      haVersion: health.version ?? null,
    })
    .returning();

  const { encryptedToken: _, userId: __, ...safe } = instance;
  return NextResponse.json(safe, { status: 201 });
}

/** PATCH /api/ha/instances — update an existing instance */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, name, url, token, analysisWindowDays } = body as {
    id?: string;
    name?: string;
    url?: string;
    token?: string;
    analysisWindowDays?: number;
  };

  if (!id) {
    return NextResponse.json(
      { error: "Instance id is required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const existing = await db
    .select()
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, id),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!existing[0]) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  const updates: Partial<{
    name: string;
    url: string;
    encryptedToken: string;
    status: "connected" | "error" | "pending";
    haVersion: string | null;
    analysisWindowDays: number;
  }> = {};

  if (name) updates.name = name;
  if (analysisWindowDays && [7, 14, 30].includes(analysisWindowDays)) {
    updates.analysisWindowDays = analysisWindowDays;
  }
  if (url) {
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }
    updates.url = url.replace(/\/+$/, "");
  }
  if (token) {
    updates.encryptedToken = encrypt(token);
  }

  // Re-test connection if url or token changed
  if (url || token) {
    const testUrl = updates.url ?? existing[0].url;
    const testToken = updates.encryptedToken ?? existing[0].encryptedToken;
    const client = new HAClient(testUrl, testToken);
    const health = await client.healthCheck();
    updates.status = health.ok ? "connected" : "error";
    updates.haVersion = health.version ?? null;
  }

  const [updated] = await db
    .update(schema.haInstances)
    .set(updates)
    .where(eq(schema.haInstances.id, id))
    .returning();

  const { encryptedToken: _, userId: __, ...safe } = updated;
  return NextResponse.json(safe);
}

/** DELETE /api/ha/instances — delete an instance (expects ?id=...) */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json(
      { error: "Instance id is required" },
      { status: 400 }
    );
  }

  // Verify ownership before deletion
  const existing = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, id),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!existing[0]) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  await db
    .delete(schema.haInstances)
    .where(eq(schema.haInstances.id, id));

  return NextResponse.json({ success: true });
}
