import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/insights — fetch AI insights for an instance
 * Query: instanceId (required), type (optional filter), status (optional filter)
 */
export async function GET(request: NextRequest) {
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

  const conditions = [eq(schema.aiAnalyses.instanceId, instanceId)];

  const typeFilter = searchParams.get("type");
  if (
    typeFilter &&
    ["insight", "suggestion", "automation", "anomaly"].includes(typeFilter)
  ) {
    conditions.push(
      eq(
        schema.aiAnalyses.type,
        typeFilter as "insight" | "suggestion" | "automation" | "anomaly"
      )
    );
  }

  const statusFilter = searchParams.get("status");
  if (
    statusFilter &&
    ["new", "viewed", "dismissed", "applied"].includes(statusFilter)
  ) {
    conditions.push(
      eq(
        schema.aiAnalyses.status,
        statusFilter as "new" | "viewed" | "dismissed" | "applied"
      )
    );
  }

  const insights = await db
    .select()
    .from(schema.aiAnalyses)
    .where(and(...conditions))
    .orderBy(desc(schema.aiAnalyses.createdAt))
    .limit(100);

  // Count by type
  const counts = await db
    .select({
      type: schema.aiAnalyses.type,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.aiAnalyses)
    .where(eq(schema.aiAnalyses.instanceId, instanceId))
    .groupBy(schema.aiAnalyses.type);

  const newCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.instanceId, instanceId),
        eq(schema.aiAnalyses.status, "new")
      )
    );

  return NextResponse.json({
    insights,
    counts: Object.fromEntries(counts.map((c) => [c.type, c.count])),
    newCount: newCount[0]?.count ?? 0,
  });
}

/**
 * PATCH /api/insights — update insight status
 * Body: { id: string, status: "viewed" | "dismissed" | "applied" }
 * Or: { ids: string[], status: ... } for bulk update
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, ids, status } = body;

  const validStatuses = ["new", "viewed", "dismissed", "applied"] as const;
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const insightIds: string[] = ids ?? (id ? [id] : []);
  if (insightIds.length === 0) {
    return NextResponse.json(
      { error: "id or ids required" },
      { status: 400 }
    );
  }

  // Verify ownership: insights belong to a user-owned instance
  const insights = await db
    .select({
      analysisId: schema.aiAnalyses.id,
      instanceId: schema.aiAnalyses.instanceId,
    })
    .from(schema.aiAnalyses)
    .innerJoin(
      schema.haInstances,
      eq(schema.aiAnalyses.instanceId, schema.haInstances.id)
    )
    .where(
      and(
        inArray(schema.aiAnalyses.id, insightIds),
        eq(schema.haInstances.userId, session.user.id)
      )
    );

  if (insights.length === 0) {
    return NextResponse.json(
      { error: "No matching insights found" },
      { status: 404 }
    );
  }

  const ownedIds = insights.map((i) => i.analysisId);

  await db
    .update(schema.aiAnalyses)
    .set({ status })
    .where(inArray(schema.aiAnalyses.id, ownedIds));

  return NextResponse.json({ updated: ownedIds.length });
}
