import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { runAllAnalyses, runAnalysis } from "@/lib/ai/analysis-service";
import { rateLimit } from "@/lib/rate-limit";
import { analysisBodySchema, formatZodError } from "@/lib/validators";
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
  const { allowed, remaining } = await rateLimit(
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

  const raw = await request.json();
  const parsed = analysisBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }
  const { instanceId, category } = parsed.data;

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

    if (category) {
      const { count } = await runAnalysis(instanceId, category);
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
