import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HAClient } from "@/lib/ha-client";
import { fullSync } from "@/lib/sync-service";
import { NextRequest, NextResponse } from "next/server";

/** POST /api/ha/sync — trigger a manual sync for an instance */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { instanceId } = body as { instanceId?: string };

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
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  // Record sync job
  const [job] = await db
    .insert(schema.syncJobs)
    .values({
      instanceId,
      type: "manual-full-sync",
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  try {
    const client = new HAClient(instance[0].url, instance[0].encryptedToken);
    const result = await fullSync(instanceId, client);

    await db
      .update(schema.syncJobs)
      .set({
        status: "completed",
        completedAt: new Date(),
        metadata: result,
      })
      .where(eq(schema.syncJobs.id, job.id));

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db
      .update(schema.syncJobs)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: errorMessage,
      })
      .where(eq(schema.syncJobs.id, job.id));

    await db
      .update(schema.haInstances)
      .set({ status: "error" })
      .where(eq(schema.haInstances.id, instanceId));

    return NextResponse.json(
      { error: `Sync failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}
