import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboard/top-entities/detail?entityId=<uuid>&days=7
 * Returns per-day stats breakdown for display in the state-changes modal.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");
  const days = Math.min(
    Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1),
    90
  );

  if (!entityId) {
    return NextResponse.json(
      { error: "entityId is required" },
      { status: 400 }
    );
  }

  // Verify entity belongs to a user-owned instance
  const entity = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
      instanceId: schema.entities.instanceId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
    })
    .from(schema.entities)
    .innerJoin(
      schema.haInstances,
      eq(schema.entities.instanceId, schema.haInstances.id)
    )
    .where(
      and(
        eq(schema.entities.id, entityId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!entity[0]) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const dailyStats = await db
    .select({
      date: schema.entityDailyStats.date,
      stateChanges: schema.entityDailyStats.stateChanges,
      activeTime: schema.entityDailyStats.activeTime,
      avgValue: schema.entityDailyStats.avgValue,
      stateDistribution: schema.entityDailyStats.stateDistribution,
    })
    .from(schema.entityDailyStats)
    .where(
      and(
        eq(schema.entityDailyStats.entityId, entityId),
        sql`${schema.entityDailyStats.date} >= ${cutoffStr}`
      )
    )
    .orderBy(desc(schema.entityDailyStats.date));

  return NextResponse.json({
    entity: entity[0],
    dailyStats,
  });
}
