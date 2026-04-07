import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HAClient } from "@/lib/ha-client";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/ha/states?instanceId=... — proxy live entity states from HA */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const entityId = searchParams.get("entityId");

  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId is required" },
      { status: 400 }
    );
  }

  const instance = await db
    .select()
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  try {
    const client = HAClient.forInstance(instance[0].url, instance[0].encryptedToken);

    if (entityId) {
      const state = await client.getState(entityId);
      return NextResponse.json(state);
    }

    const states = await client.getStates();
    return NextResponse.json(states);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to fetch states";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
