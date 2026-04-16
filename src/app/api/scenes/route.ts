import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

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

  // Get scenes
  const scenes = await db
    .select({
      id: schema.scenes.id,
      entityId: schema.scenes.entityId,
      name: schema.scenes.name,
      icon: schema.scenes.icon,
      areaId: schema.scenes.areaId,
      entityIds: schema.scenes.entityIds,
      lastActivated: schema.scenes.lastActivated,
      activationCount: schema.scenes.activationCount,
    })
    .from(schema.scenes)
    .where(eq(schema.scenes.instanceId, instanceId))
    .orderBy(desc(schema.scenes.activationCount));

  // Get scripts
  const scripts = await db
    .select({
      id: schema.scripts.id,
      entityId: schema.scripts.entityId,
      name: schema.scripts.name,
      icon: schema.scripts.icon,
      description: schema.scripts.description,
      mode: schema.scripts.mode,
      lastTriggered: schema.scripts.lastTriggered,
      triggerCount: schema.scripts.triggerCount,
    })
    .from(schema.scripts)
    .where(eq(schema.scripts.instanceId, instanceId))
    .orderBy(desc(schema.scripts.triggerCount));

  return NextResponse.json({ scenes, scripts });
}
