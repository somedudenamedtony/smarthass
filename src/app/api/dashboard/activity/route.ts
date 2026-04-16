import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const days = parseInt(searchParams.get("days") || "7", 10);

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  // Verify instance ownership
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

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split("T")[0]; // Convert to YYYY-MM-DD string

  // Get daily activity from entityDailyStats (aggregated state changes per day)
  const dailyStats = await db
    .select({
      date: schema.entityDailyStats.date,
      stateChanges: schema.entityDailyStats.stateChanges,
      hourlyActivity: schema.entityDailyStats.hourlyActivity,
    })
    .from(schema.entityDailyStats)
    .innerJoin(
      schema.entities,
      eq(schema.entityDailyStats.entityId, schema.entities.id)
    )
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        gte(schema.entityDailyStats.date, startDateStr)
      )
    );

  // Aggregate daily activity
  const dailyMap = new Map<string, number>();
  const hourlyMap = new Map<number, number>();

  for (const stat of dailyStats) {
    const dateStr = stat.date; // Already a string in YYYY-MM-DD format
    dailyMap.set(dateStr, (dailyMap.get(dateStr) || 0) + (stat.stateChanges || 0));

    // Aggregate hourly activity
    if (stat.hourlyActivity && typeof stat.hourlyActivity === "object") {
      const hourly = stat.hourlyActivity as Record<string, number>;
      for (const [hour, count] of Object.entries(hourly)) {
        const h = parseInt(hour, 10);
        if (!isNaN(h)) {
          hourlyMap.set(h, (hourlyMap.get(h) || 0) + count);
        }
      }
    }
  }

  // Convert to arrays
  const dailyActivity = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const hourlyActivity = Array.from(hourlyMap.entries())
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  // Get recent entity updates (using lastChangedAt from entities table)
  const recentEntities = await db
    .select({
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      lastState: schema.entities.lastState,
      lastChangedAt: schema.entities.lastChangedAt,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId))
    .orderBy(desc(schema.entities.lastChangedAt))
    .limit(20);

  // Calculate summary stats
  const totalChanges = dailyActivity.reduce((sum, d) => sum + d.count, 0);
  const avgChangesPerDay = days > 0 ? totalChanges / days : 0;

  return NextResponse.json({
    summary: {
      totalChanges,
      avgChangesPerDay: Math.round(avgChangesPerDay),
      days,
    },
    dailyActivity,
    hourlyActivity,
    recentActivity: recentEntities.map((e) => ({
      entityId: e.entityId,
      name: e.friendlyName || e.entityId.split(".")[1],
      domain: e.domain || e.entityId.split(".")[0],
      currentState: e.lastState,
      changedAt: e.lastChangedAt,
    })),
  });
}
