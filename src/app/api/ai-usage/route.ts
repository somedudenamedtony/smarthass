import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * GET /api/ai-usage?instanceId=...
 * Returns AI usage statistics: token totals, run history, per-day breakdown,
 * per-category insight totals, and 30-day trend comparison.
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

  // Current 30-day window tokens & runs
  const [current30] = await db
    .select({
      tokens: sql<number>`coalesce(sum(${schema.analysisRuns.tokensUsed}), 0)`,
      runs: count(),
    })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        sql`${schema.analysisRuns.startedAt} >= now() - interval '30 days'`
      )
    );

  // Previous 30-day window (31-60 days ago) for trend comparison
  const [prev30] = await db
    .select({
      tokens: sql<number>`coalesce(sum(${schema.analysisRuns.tokensUsed}), 0)`,
      runs: count(),
    })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        sql`${schema.analysisRuns.startedAt} >= now() - interval '60 days'`,
        sql`${schema.analysisRuns.startedAt} < now() - interval '30 days'`
      )
    );

  // Last 30 days daily token usage (sparse — only days with runs)
  const sparseDaily = await db
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

  // Fill in missing days so the chart shows a continuous 30-day timeline
  const dailyMap = new Map(sparseDaily.map((d) => [d.date, d]));
  const dailyUsage: { date: string; tokens: number; runs: number }[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = dailyMap.get(key);
    dailyUsage.push({
      date: key,
      tokens: entry ? Number(entry.tokens) : 0,
      runs: entry ? Number(entry.runs) : 0,
    });
  }

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

  // Aggregate insight counts across all completed runs by category
  const categoryTotals = await db
    .select({
      insightsGenerated: schema.analysisRuns.insightsGenerated,
    })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        eq(schema.analysisRuns.status, "completed")
      )
    );

  const insightsByCategory: Record<string, number> = {};
  for (const run of categoryTotals) {
    const gen = run.insightsGenerated as Record<string, number> | null;
    if (gen) {
      for (const [cat, n] of Object.entries(gen)) {
        insightsByCategory[cat] = (insightsByCategory[cat] ?? 0) + (typeof n === "number" ? n : 0);
      }
    }
  }

  // Last completed run timestamp
  const [lastRun] = await db
    .select({ completedAt: schema.analysisRuns.completedAt })
    .from(schema.analysisRuns)
    .where(
      and(
        eq(schema.analysisRuns.instanceId, instanceId),
        eq(schema.analysisRuns.status, "completed")
      )
    )
    .orderBy(desc(schema.analysisRuns.completedAt))
    .limit(1);

  return NextResponse.json({
    totals: {
      totalRuns: totals.totalRuns,
      totalTokens: Number(totals.totalTokens),
      completedRuns: Number(totals.completedRuns),
      failedRuns: Number(totals.failedRuns),
      avgTokensPerRun: Math.round(Number(avgStats.avgTokens)),
    },
    trend: {
      currentTokens: Number(current30.tokens),
      previousTokens: Number(prev30.tokens),
      currentRuns: Number(current30.runs),
      previousRuns: Number(prev30.runs),
    },
    insightsByCategory,
    lastCompletedAt: lastRun?.completedAt ?? null,
    dailyUsage,
    recentRuns,
  });
}
