import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/entities/[id] — single entity with daily stats
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const entity = await db
    .select()
    .from(schema.entities)
    .where(eq(schema.entities.id, id))
    .limit(1);

  if (!entity[0]) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  // Verify ownership
  const instance = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, entity[0].instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  // Get daily stats (last 30 days)
  const dailyStats = await db
    .select()
    .from(schema.entityDailyStats)
    .where(eq(schema.entityDailyStats.entityId, id))
    .orderBy(desc(schema.entityDailyStats.date))
    .limit(30);

  return NextResponse.json({
    entity: entity[0],
    dailyStats,
  });
}
