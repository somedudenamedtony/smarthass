import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");

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

  // Get areas with entity counts
  const areas = await db
    .select({
      id: schema.areas.id,
      haAreaId: schema.areas.haAreaId,
      name: schema.areas.name,
      icon: schema.areas.icon,
      floorId: schema.areas.floorId,
    })
    .from(schema.areas)
    .where(eq(schema.areas.instanceId, instanceId));

  // Get entity counts per area
  const entityCounts = await db
    .select({
      areaId: schema.entities.areaId,
      count: sql<number>`count(*)::int`,
      activeCount: sql<number>`count(*) filter (where ${schema.entities.lastState} in ('on', 'home', 'open', 'playing'))::int`,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId))
    .groupBy(schema.entities.areaId);

  const countMap = new Map(
    entityCounts.map((c) => [c.areaId, { count: c.count, activeCount: c.activeCount }])
  );

  const areasWithCounts = areas.map((area) => ({
    ...area,
    entityCount: countMap.get(area.haAreaId)?.count ?? 0,
    activeCount: countMap.get(area.haAreaId)?.activeCount ?? 0,
  }));

  // Sort by entity count descending
  areasWithCounts.sort((a, b) => b.entityCount - a.entityCount);

  return NextResponse.json({ areas: areasWithCounts });
}
