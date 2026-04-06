import { NextRequest, NextResponse } from "next/server";
import { isCloud } from "@/lib/config";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { HAClient } from "@/lib/ha-client";
import { syncEntities, syncAutomations, computeDailyStats, computeBaselines } from "@/lib/sync-service";

export async function POST(request: NextRequest) {
  // Verify cron secret in cloud mode
  if (isCloud()) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Self-hosted: accept internal calls from node-cron
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== "internal") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    console.log("[daily-sync] Starting daily sync...");

    // Get all connected HA instances
    const instances = await db
      .select()
      .from(schema.haInstances)
      .where(eq(schema.haInstances.status, "connected"));

    const results = [];

    for (const instance of instances) {
      const jobId = crypto.randomUUID();
      try {
        // Record sync job
        await db.insert(schema.syncJobs).values({
          id: jobId,
          instanceId: instance.id,
          type: "daily-sync",
          status: "running",
          startedAt: new Date(),
        });

        const client = new HAClient(instance.url, instance.encryptedToken);

        // Sync entities and automations
        const entityCount = await syncEntities(instance.id, client);
        const automationCount = await syncAutomations(instance.id, client);

        // Compute daily stats for tracked entities
        const statsCount = await computeDailyStats(instance.id, client);

        // Compute baselines from historical stats
        const baselineCount = await computeBaselines(instance.id);

        // Update instance sync timestamp
        await db
          .update(schema.haInstances)
          .set({ lastSyncAt: new Date() })
          .where(eq(schema.haInstances.id, instance.id));

        // Mark job complete
        await db
          .update(schema.syncJobs)
          .set({
            status: "completed",
            completedAt: new Date(),
            metadata: { entityCount, automationCount, statsCount, baselineCount },
          })
          .where(eq(schema.syncJobs.id, jobId));

        results.push({
          instanceId: instance.id,
          name: instance.name,
          entityCount,
          automationCount,
          statsCount,
          baselineCount,
        });

        console.log(
          `[daily-sync] ${instance.name}: ${entityCount} entities, ${automationCount} automations, ${statsCount} stats, ${baselineCount} baselines`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[daily-sync] Failed for instance ${instance.name}:`,
          errorMessage
        );

        await db
          .update(schema.syncJobs)
          .set({
            status: "failed",
            completedAt: new Date(),
            error: errorMessage,
          })
          .where(eq(schema.syncJobs.id, jobId));

        results.push({
          instanceId: instance.id,
          name: instance.name,
          error: errorMessage,
        });
      }
    }

    console.log(`[daily-sync] Completed. Processed ${instances.length} instances.`);

    return NextResponse.json({
      success: true,
      instancesProcessed: instances.length,
      results,
    });
  } catch (error) {
    console.error("[daily-sync] Error:", error);
    return NextResponse.json(
      { error: "Daily sync failed" },
      { status: 500 }
    );
  }
}
