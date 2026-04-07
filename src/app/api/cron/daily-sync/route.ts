import { NextRequest, NextResponse } from "next/server";
import { isCloud, isHomeAssistant } from "@/lib/config";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { HAClient } from "@/lib/ha-client";
import { syncEntities, syncAutomations, computeDailyStats, computeBaselines, reconcileSync, withRetry } from "@/lib/sync-service";

export async function POST(request: NextRequest) {
  // Verify cron secret in cloud mode
  if (isCloud()) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    // Self-hosted / HA add-on: accept internal calls from node-cron
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== "internal") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const useReconciliation = false; // Always run full sync — WebSocket continuous sync is not active in standalone mode

  try {
    console.log(`[daily-sync] Starting ${useReconciliation ? "reconciliation" : "full"} sync...`);

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
          type: useReconciliation ? "reconcile-sync" : "daily-sync",
          status: "running",
          startedAt: new Date(),
        });

        const client = HAClient.forInstance(instance.url, instance.encryptedToken);

        let metadata: Record<string, unknown>;

        if (useReconciliation) {
          // HA add-on mode: WebSocket handles real-time state tracking,
          // just reconcile entities/automations and compute baselines
          const result = await reconcileSync(instance.id, client);
          metadata = result;

          results.push({
            instanceId: instance.id,
            name: instance.name,
            mode: "reconciliation",
            ...result,
          });

          console.log(
            `[daily-sync] ${instance.name} (reconcile): ${result.entityCount} entities, ${result.automationCount} automations, ${result.baselineCount} baselines`
          );
        } else {
          // Cloud / self-hosted: full REST-based sync
          const entityCount = await withRetry(
            () => syncEntities(instance.id, client),
            `syncEntities(${instance.name})`
          );
          const automationCount = await withRetry(
            () => syncAutomations(instance.id, client),
            `syncAutomations(${instance.name})`
          );
          const statsCount = await withRetry(
            () => computeDailyStats(instance.id, client),
            `computeDailyStats(${instance.name})`
          );
          const baselineCount = await computeBaselines(instance.id);

          metadata = { entityCount, automationCount, statsCount, baselineCount };

          // Update instance sync timestamp
          await db
            .update(schema.haInstances)
            .set({ lastSyncAt: new Date() })
            .where(eq(schema.haInstances.id, instance.id));

          results.push({
            instanceId: instance.id,
            name: instance.name,
            mode: "full",
            entityCount,
            automationCount,
            statsCount,
            baselineCount,
          });

          console.log(
            `[daily-sync] ${instance.name}: ${entityCount} entities, ${automationCount} automations, ${statsCount} stats, ${baselineCount} baselines`
          );
        }

        // Mark job complete
        await db
          .update(schema.syncJobs)
          .set({
            status: "completed",
            completedAt: new Date(),
            metadata,
          })
          .where(eq(schema.syncJobs.id, jobId));
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
