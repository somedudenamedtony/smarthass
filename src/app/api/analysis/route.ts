import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { runAllAnalyses, runAnalysis } from "@/lib/ai/analysis-service";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/analysis — trigger on-demand AI analysis
 * Body: { instanceId: string, category?: string }
 * If category is omitted, runs all analysis types.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 analysis runs per user per 10 minutes
  const { allowed, remaining } = rateLimit(
    `analysis:${session.user.id}`,
    5,
    600_000
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Please wait before running another analysis." },
      {
        status: 429,
        headers: { "X-RateLimit-Remaining": String(remaining) },
      }
    );
  }

  const { instanceId, category } = await request.json();

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 503 }
    );
  }

  try {
    let results: Record<string, number>;

    const validCategories = [
      "usage_patterns",
      "anomaly_detection",
      "automation_gaps",
      "efficiency",
    ] as const;

    if (
      category &&
      validCategories.includes(
        category as (typeof validCategories)[number]
      )
    ) {
      const count = await runAnalysis(
        instanceId,
        category as (typeof validCategories)[number]
      );
      results = { [category]: count };
    } else {
      results = await runAllAnalyses(instanceId);
    }

    const totalInsights = Object.values(results).reduce((a, b) => a + b, 0);

    return NextResponse.json({
      success: true,
      totalInsights,
      results,
    });
  } catch (error) {
    console.error("[analysis] Error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
