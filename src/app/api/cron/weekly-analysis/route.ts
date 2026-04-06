import { NextRequest, NextResponse } from "next/server";
import { isCloud } from "@/lib/config";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { runAllAnalysesBatch } from "@/lib/ai/analysis-service";
import { hasConfig } from "@/lib/app-config";

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

  if (!(await hasConfig("ANTHROPIC_API_KEY"))) {
    console.warn("[weekly-analysis] Anthropic API key not configured, skipping");
    return NextResponse.json(
      { success: false, error: "Anthropic API key not configured" },
      { status: 503 }
    );
  }

  try {
    console.log("[weekly-analysis] Starting weekly analysis (batch mode)...");

    const instances = await db
      .select({ id: schema.haInstances.id, name: schema.haInstances.name })
      .from(schema.haInstances)
      .where(eq(schema.haInstances.status, "connected"));

    const results = [];

    for (const instance of instances) {
      try {
        const { batchId, skipped, results: counts } = await runAllAnalysesBatch(instance.id);

        if (skipped) {
          console.log(`[weekly-analysis] ${instance.name}: skipped (data unchanged)`);
          results.push({
            instanceId: instance.id,
            name: instance.name,
            skipped: true,
          });
          continue;
        }

        const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
        results.push({
          instanceId: instance.id,
          name: instance.name,
          insights: total,
          breakdown: counts,
          batchId,
        });
        console.log(
          `[weekly-analysis] ${instance.name}: ${total} insights generated via batch ${batchId}`
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[weekly-analysis] Failed for ${instance.name}:`,
          msg
        );
        results.push({
          instanceId: instance.id,
          name: instance.name,
          error: msg,
        });
      }
    }

    console.log(
      `[weekly-analysis] Completed. Processed ${instances.length} instances.`
    );

    return NextResponse.json({
      success: true,
      instancesProcessed: instances.length,
      results,
    });
  } catch (error) {
    console.error("[weekly-analysis] Error:", error);
    return NextResponse.json(
      { error: "Weekly analysis failed" },
      { status: 500 }
    );
  }
}
