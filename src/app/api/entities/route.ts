import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, like, sql, count, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { entityPatchSchema, formatZodError } from "@/lib/validators";

/**
 * GET /api/entities?instanceId=...&domain=...&search=...&page=1&limit=50
 * List entities with optional filtering.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const domain = searchParams.get("domain");
  const search = searchParams.get("search");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));

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

  // Build conditions
  const conditions = [eq(schema.entities.instanceId, instanceId)];

  if (domain) {
    conditions.push(eq(schema.entities.domain, domain));
  }

  if (search) {
    conditions.push(
      sql`(${schema.entities.friendlyName} ILIKE ${"%" + search + "%"} OR ${schema.entities.entityId} ILIKE ${"%" + search + "%"})`
    );
  }

  const where = and(...conditions);

  // Total count
  const [total] = await db
    .select({ count: count() })
    .from(schema.entities)
    .where(where);

  // Paginated results
  const entities = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
      areaId: schema.entities.areaId,
      lastState: schema.entities.lastState,
      lastChangedAt: schema.entities.lastChangedAt,
      isTracked: schema.entities.isTracked,
    })
    .from(schema.entities)
    .where(where)
    .orderBy(schema.entities.domain, schema.entities.entityId)
    .limit(limit)
    .offset((page - 1) * limit);

  // Fetch recent state distributions for the returned entities
  const entityIds = entities.map((e) => e.id);
  let stateDistMap: Record<string, Record<string, number>> = {};
  if (entityIds.length > 0) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const weekAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const statsRows = await db
      .select({
        entityId: schema.entityDailyStats.entityId,
        stateDistribution: schema.entityDailyStats.stateDistribution,
      })
      .from(schema.entityDailyStats)
      .where(
        and(
          inArray(schema.entityDailyStats.entityId, entityIds),
          sql`${schema.entityDailyStats.date} >= ${weekAgoStr}`
        )
      );

    // Aggregate state distributions across days
    for (const row of statsRows) {
      const dist = row.stateDistribution as Record<string, number> | null;
      if (!dist) continue;
      if (!stateDistMap[row.entityId]) stateDistMap[row.entityId] = {};
      for (const [state, secs] of Object.entries(dist)) {
        stateDistMap[row.entityId][state] =
          (stateDistMap[row.entityId][state] || 0) + secs;
      }
    }
  }

  const entitiesWithStates = entities.map((e) => ({
    ...e,
    stateDistribution: stateDistMap[e.id] || null,
  }));

  // Distinct domains for filter
  const domains = await db
    .selectDistinct({ domain: schema.entities.domain })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId))
    .orderBy(schema.entities.domain);

  return NextResponse.json({
    entities: entitiesWithStates,
    domains: domains.map((d) => d.domain),
    pagination: {
      page,
      limit,
      total: total.count,
      totalPages: Math.ceil(total.count / limit),
    },
  });
}

/**
 * PATCH /api/entities — toggle tracking for an entity
 * Body: { id: string, isTracked: boolean }
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = entityPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { id, isTracked } = parsed.data;

  // Verify ownership via instance
  const entity = await db
    .select({
      id: schema.entities.id,
      instanceId: schema.entities.instanceId,
    })
    .from(schema.entities)
    .where(eq(schema.entities.id, id))
    .limit(1);

  if (!entity[0]) {
    return NextResponse.json({ error: "Entity not found" }, { status: 404 });
  }

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

  await db
    .update(schema.entities)
    .set({ isTracked })
    .where(eq(schema.entities.id, id));

  return NextResponse.json({ success: true });
}
