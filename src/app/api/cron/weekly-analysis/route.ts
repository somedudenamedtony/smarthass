import { NextRequest, NextResponse } from "next/server";
import { isCloud } from "@/lib/config";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { runAllAnalyses } from "@/lib/ai/analysis-service";

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

  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("[weekly-analysis] ANTHROPIC_API_KEY not set, skipping");
    return NextResponse.json(
      { success: false, error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  try {
    console.log("[weekly-analysis] Starting weekly analysis...");

    const instances = await db
      .select({ id: schema.haInstances.id, name: schema.haInstances.name })
      .from(schema.haInstances)
      .where(eq(schema.haInstances.status, "connected"));

    const results = [];

    for (const instance of instances) {
      try {
        const counts = await runAllAnalyses(instance.id);
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        results.push({
          instanceId: instance.id,
          name: instance.name,
          insights: total,
          breakdown: counts,
        });
        console.log(
          `[weekly-analysis] ${instance.name}: ${total} insights generated`
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
