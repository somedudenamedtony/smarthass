import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/insights/entity/[entityId] — get insights relevant to a specific HA entity_id
 * Query: instanceId (required)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { entityId } = await params;
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

  // Find insights where metadata->entityIds contains this entity_id
  const insights = await db
    .select()
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.instanceId, instanceId),
        sql`${schema.aiAnalyses.metadata}::jsonb -> 'entityIds' ? ${entityId}`
      )
    )
    .orderBy(desc(schema.aiAnalyses.createdAt))
    .limit(20);

  return NextResponse.json({ insights });
}
