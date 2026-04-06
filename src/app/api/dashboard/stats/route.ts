import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboard/stats?instanceId=...
 * Returns aggregated dashboard metrics for the overview page.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");

  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId is required" },
      { status: 400 }
    );
  }

  // Verify ownership
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
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Total entities
  const [entityCount] = await db
    .select({ count: count() })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  // Active automations
  const [automationCount] = await db
    .select({ count: count() })
    .from(schema.automations)
    .where(
      and(
        eq(schema.automations.instanceId, instanceId),
        eq(schema.automations.enabled, true)
      )
    );

  // Total automations
  const [totalAutomations] = await db
    .select({ count: count() })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  // Tracked entities
  const [trackedCount] = await db
    .select({ count: count() })
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        eq(schema.entities.isTracked, true)
      )
    );

  // Today's state changes (from entity_daily_stats)
  const today = new Date().toISOString().split("T")[0];
  const todayStats = await db
    .select({
      totalChanges: sql<number>`coalesce(sum(${schema.entityDailyStats.stateChanges}), 0)`,
    })
    .from(schema.entityDailyStats)
    .innerJoin(
      schema.entities,
      eq(schema.entityDailyStats.entityId, schema.entities.id)
    )
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        eq(schema.entityDailyStats.date, today)
      )
    );

  // Top 5 most active entities (by state changes, last 7 days)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const weekAgoStr = sevenDaysAgo.toISOString().split("T")[0];

  const topEntities = await db
    .select({
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      totalChanges: sql<number>`coalesce(sum(${schema.entityDailyStats.stateChanges}), 0)`.as(
        "total_changes"
      ),
    })
    .from(schema.entityDailyStats)
    .innerJoin(
      schema.entities,
      eq(schema.entityDailyStats.entityId, schema.entities.id)
    )
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        sql`${schema.entityDailyStats.date} >= ${weekAgoStr}`
      )
    )
    .groupBy(
      schema.entities.entityId,
      schema.entities.friendlyName,
      schema.entities.domain
    )
    .orderBy(desc(sql`total_changes`))
    .limit(5);

  // Domain distribution
  const domainDistribution = await db
    .select({
      domain: schema.entities.domain,
      count: count(),
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId))
    .groupBy(schema.entities.domain)
    .orderBy(desc(count()));

  // Recent state changes (last 20 entities that changed)
  const recentChanges = await db
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

  return NextResponse.json({
    instance: {
      name: instance[0].name,
      status: instance[0].status,
      haVersion: instance[0].haVersion,
      lastSyncAt: instance[0].lastSyncAt,
    },
    metrics: {
      totalEntities: entityCount.count,
      activeAutomations: automationCount.count,
      totalAutomations: totalAutomations.count,
      trackedEntities: trackedCount.count,
      stateChangesToday: todayStats[0]?.totalChanges ?? 0,
    },
    topEntities,
    domainDistribution,
    recentChanges,
  });
}
