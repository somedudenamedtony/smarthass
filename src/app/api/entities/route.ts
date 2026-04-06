import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, like, sql, count } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

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

  // Distinct domains for filter
  const domains = await db
    .selectDistinct({ domain: schema.entities.domain })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId))
    .orderBy(schema.entities.domain);

  return NextResponse.json({
    entities,
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

  const { id, isTracked } = await request.json();
  if (!id || typeof isTracked !== "boolean") {
    return NextResponse.json(
      { error: "id and isTracked are required" },
      { status: 400 }
    );
  }

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
