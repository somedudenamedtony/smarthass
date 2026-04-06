import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboard/top-entities?instanceId=...&days=7
 * Returns all tracked entities with detailed daily stats aggregated over the period.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const days = Math.min(
    Math.max(parseInt(searchParams.get("days") || "7", 10) || 7, 1),
    90
  );

  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId is required" },
      { status: 400 }
    );
  }

  // Verify ownership
  const instance = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const entities = await db
    .select({
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      platform: schema.entities.platform,
      areaId: schema.entities.areaId,
      lastState: schema.entities.lastState,
      lastChangedAt: schema.entities.lastChangedAt,
      totalChanges: sql<number>`coalesce(sum(${schema.entityDailyStats.stateChanges}), 0)`.as(
        "total_changes"
      ),
      totalActiveTime: sql<number>`coalesce(sum(${schema.entityDailyStats.activeTime}), 0)`.as(
        "total_active_time"
      ),
      avgValue: sql<string | null>`round(avg(${schema.entityDailyStats.avgValue}::numeric), 2)`.as(
        "avg_value"
      ),
      minValue: sql<string | null>`min(${schema.entityDailyStats.minValue})`.as(
        "min_value"
      ),
      maxValue: sql<string | null>`max(${schema.entityDailyStats.maxValue})`.as(
        "max_value"
      ),
      daysWithData: sql<number>`count(distinct ${schema.entityDailyStats.date})`.as(
        "days_with_data"
      ),
    })
    .from(schema.entities)
    .leftJoin(
      schema.entityDailyStats,
      and(
        eq(schema.entityDailyStats.entityId, schema.entities.id),
        sql`${schema.entityDailyStats.date} >= ${cutoffStr}`
      )
    )
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        eq(schema.entities.isTracked, true)
      )
    )
    .groupBy(
      schema.entities.entityId,
      schema.entities.friendlyName,
      schema.entities.domain,
      schema.entities.platform,
      schema.entities.areaId,
      schema.entities.lastState,
      schema.entities.lastChangedAt
    )
    .orderBy(desc(sql`total_changes`));

  return NextResponse.json({ entities, days });
}
