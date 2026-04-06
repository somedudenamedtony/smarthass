import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/ai-usage?instanceId=...
 * Returns AI usage statistics: token totals, run history, per-day breakdown.
 */
export async function GET(request: Request) {
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
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Total runs & tokens
  const [totals] = await db
    .select({
      totalRuns: count(),
      totalTokens: sql<number>`coalesce(sum(${schema.analysisRuns.tokensUsed}), 0)`,
      completedRuns: sql<number>`count(*) filter (where ${schema.analysisRuns.status} = 'completed')`,
      failedRuns: sql<number>`count(*) filter (where ${schema.analysisRuns.status} = 'failed')`,
    })
    .from(schema.analysisRuns)
    .where(eq(schema.analysisRuns.instanceId, instanceId));

  // Last 30 days daily token usage
  const dailyUsage = await db
    .select({
      date: sql<string>`date(${schema.analysisRuns.startedAt})`,
      tokens: sql<number>`coalesce(sum(${schema.analysisRuns.tokensUsed}), 0)`,
      runs: count(),
    })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        sql`${schema.analysisRuns.startedAt} >= now() - interval '30 days'`
      )
    )
    .groupBy(sql`date(${schema.analysisRuns.startedAt})`)
    .orderBy(sql`date(${schema.analysisRuns.startedAt})`);

  // Recent runs (last 20)
  const recentRuns = await db
    .select({
      id: schema.analysisRuns.id,
      startedAt: schema.analysisRuns.startedAt,
      completedAt: schema.analysisRuns.completedAt,
      status: schema.analysisRuns.status,
      tokensUsed: schema.analysisRuns.tokensUsed,
      insightsGenerated: schema.analysisRuns.insightsGenerated,
      error: schema.analysisRuns.error,
    })
    .from(schema.analysisRuns)
    .where(eq(schema.analysisRuns.instanceId, instanceId))
    .orderBy(desc(schema.analysisRuns.startedAt))
    .limit(20);

  // Avg tokens per run (completed only)
  const [avgStats] = await db
    .select({
      avgTokens: sql<number>`coalesce(avg(${schema.analysisRuns.tokensUsed}), 0)`,
    })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        eq(schema.analysisRuns.status, "completed")
      )
    );

  return NextResponse.json({
    totals: {
      totalRuns: totals.totalRuns,
      totalTokens: Number(totals.totalTokens),
      completedRuns: Number(totals.completedRuns),
      failedRuns: Number(totals.failedRuns),
      avgTokensPerRun: Math.round(Number(avgStats.avgTokens)),
    },
    dailyUsage,
    recentRuns,
  });
}
