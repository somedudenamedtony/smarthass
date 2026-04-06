import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HAClient } from "@/lib/ha-client";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/ha/logbook?instanceId=...&start=...&end=...&entityId=...
 * Proxy logbook entries from HA.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const entityId = searchParams.get("entityId");

  if (!instanceId || !start) {
    return NextResponse.json(
      { error: "instanceId and start are required" },
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
    const client = new HAClient(instance[0].url, instance[0].encryptedToken);
    const logbook = await client.getLogbook(
      start,
      entityId ?? undefined,
      end ?? undefined
    );
    return NextResponse.json(logbook);
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "Failed to fetch logbook";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
