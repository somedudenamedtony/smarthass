import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/entities/[id]?days=30 — single entity with daily stats
 * Returns current-period and previous-period stats for comparison.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, parseInt(searchParams.get("days") ?? "30", 10)));

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

  // Fetch 2x the requested window so we can compare current vs previous
  const totalDays = days * 2;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - totalDays);

  const allStats = await db
    .select()
    .from(schema.entityDailyStats)
    .where(
      and(
        eq(schema.entityDailyStats.entityId, id),
        gte(schema.entityDailyStats.date, cutoffDate.toISOString().slice(0, 10))
      )
    )
    .orderBy(desc(schema.entityDailyStats.date));

  const midDate = new Date();
  midDate.setDate(midDate.getDate() - days);
  const midStr = midDate.toISOString().slice(0, 10);

  const currentPeriod = allStats.filter((s) => s.date >= midStr);
  const previousPeriod = allStats.filter((s) => s.date < midStr);

  // Compute aggregate comparison
  const aggregate = (rows: typeof allStats) => {
    if (rows.length === 0) return null;
    const totalChanges = rows.reduce((s, r) => s + r.stateChanges, 0);
    const totalActive = rows.reduce((s, r) => s + r.activeTime, 0);
    return {
      totalStateChanges: totalChanges,
      totalActiveTime: totalActive,
      avgDailyChanges: Math.round(totalChanges / rows.length),
      avgDailyActiveTime: Math.round(totalActive / rows.length),
      days: rows.length,
    };
  };

  return NextResponse.json({
    entity: entity[0],
    dailyStats: currentPeriod,
    days,
    currentPeriodStats: aggregate(currentPeriod),
    previousPeriodStats: aggregate(previousPeriod),
  });
}
