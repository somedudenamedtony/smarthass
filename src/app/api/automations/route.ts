import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/automations?instanceId=...
 * List all automations for an instance.
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

  const automations = await db
    .select({
      id: schema.automations.id,
      haAutomationId: schema.automations.haAutomationId,
      alias: schema.automations.alias,
      description: schema.automations.description,
      enabled: schema.automations.enabled,
      lastTriggered: schema.automations.lastTriggered,
      createdAt: schema.automations.createdAt,
    })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId))
    .orderBy(schema.automations.alias);

  return NextResponse.json(automations);
}
