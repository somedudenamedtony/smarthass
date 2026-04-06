import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, sql, gte, inArray } from "drizzle-orm";
import type {
  AnalysisInput,
  AnalysisResult,
  EntitySnapshot,
  AutomationSnapshot,
  DailyStatSnapshot,
  FeedbackEntry,
  BaselineSnapshot,
} from "./types";
import {
  buildUsagePatternsPrompt,
  buildAnomalyDetectionPrompt,
  buildAutomationGapsPrompt,
  buildEfficiencyPrompt,
} from "./prompts";

// ── Client ──────────────────────────────────────────────────────────────────

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

// ── Data Gathering ──────────────────────────────────────────────────────────

async function gatherAnalysisInput(
  instanceId: string
): Promise<AnalysisInput> {
  // Load instance settings for configurable window
  const [instance] = await db
    .select({ analysisWindowDays: schema.haInstances.analysisWindowDays })
    .from(schema.haInstances)
    .where(eq(schema.haInstances.id, instanceId))
    .limit(1);

  const windowDays = instance?.analysisWindowDays ?? 14;

  // Entities
  const entitiesRaw = await db
    .select({
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
      lastState: schema.entities.lastState,
      areaId: schema.entities.areaId,
      isTracked: schema.entities.isTracked,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  const entities: EntitySnapshot[] = entitiesRaw;

  // Automations
  const automationsRaw = await db
    .select({
      haAutomationId: schema.automations.haAutomationId,
      alias: schema.automations.alias,
      description: schema.automations.description,
      triggerConfig: schema.automations.triggerConfig,
      conditionConfig: schema.automations.conditionConfig,
      actionConfig: schema.automations.actionConfig,
      enabled: schema.automations.enabled,
      lastTriggered: schema.automations.lastTriggered,
    })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  const automations: AutomationSnapshot[] = automationsRaw;

  // Current period daily stats
  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);
  const cutoff = windowStart.toISOString().split("T")[0];

  // Previous period daily stats (same window size, immediately before current)
  const prevWindowStart = new Date();
  prevWindowStart.setDate(prevWindowStart.getDate() - windowDays * 2);
  const prevCutoff = prevWindowStart.toISOString().split("T")[0];

  const allStatsRaw = await db
    .select({
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      date: schema.entityDailyStats.date,
      stateChanges: schema.entityDailyStats.stateChanges,
      activeTime: schema.entityDailyStats.activeTime,
      avgValue: schema.entityDailyStats.avgValue,
      minValue: schema.entityDailyStats.minValue,
      maxValue: schema.entityDailyStats.maxValue,
      stateDistribution: schema.entityDailyStats.stateDistribution,
    })
    .from(schema.entityDailyStats)
    .innerJoin(
      schema.entities,
      eq(schema.entityDailyStats.entityId, schema.entities.id)
    )
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        sql`${schema.entityDailyStats.date} >= ${prevCutoff}`
      )
    )
    .orderBy(schema.entities.entityId, desc(schema.entityDailyStats.date));

  const allStats: DailyStatSnapshot[] = allStatsRaw.map((s) => ({
    ...s,
    stateDistribution: s.stateDistribution as Record<string, number> | null,
  }));

  // Split into current and previous periods
  const dailyStats = allStats.filter((s) => s.date >= cutoff);
  const previousPeriodStats = allStats.filter((s) => s.date < cutoff);

  // Feedback history: dismissed/applied insights from last 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const feedbackRaw = await db
    .select({
      title: schema.aiAnalyses.title,
      type: schema.aiAnalyses.type,
      status: schema.aiAnalyses.status,
      metadata: schema.aiAnalyses.metadata,
      createdAt: schema.aiAnalyses.createdAt,
    })
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.instanceId, instanceId),
        inArray(schema.aiAnalyses.status, ["dismissed", "applied"]),
        gte(schema.aiAnalyses.createdAt, ninetyDaysAgo)
      )
    );

  const feedbackHistory: FeedbackEntry[] = feedbackRaw.map((f) => ({
    title: f.title,
    type: f.type,
    status: f.status as "dismissed" | "applied",
    entityIds: (f.metadata as { entityIds?: string[] })?.entityIds ?? [],
    createdAt: f.createdAt.toISOString(),
  }));

  // Baselines for tracked entities
  const baselinesRaw = await db
    .select({
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      dayOfWeek: schema.entityBaselines.dayOfWeek,
      avgStateChanges: schema.entityBaselines.avgStateChanges,
      avgActiveTime: schema.entityBaselines.avgActiveTime,
      stdDevStateChanges: schema.entityBaselines.stdDevStateChanges,
    })
    .from(schema.entityBaselines)
    .innerJoin(
      schema.entities,
      eq(schema.entityBaselines.entityId, schema.entities.id)
    )
    .where(eq(schema.entities.instanceId, instanceId));

  const baselines: BaselineSnapshot[] = baselinesRaw.map((b) => ({
    ...b,
    avgStateChanges: b.avgStateChanges ? Number(b.avgStateChanges) : null,
    avgActiveTime: b.avgActiveTime ? Number(b.avgActiveTime) : null,
    stdDevStateChanges: b.stdDevStateChanges ? Number(b.stdDevStateChanges) : null,
  }));

  return {
    instanceId,
    entities,
    automations,
    dailyStats,
    previousPeriodStats,
    feedbackHistory,
    baselines,
    analysisWindowDays: windowDays,
  };
}

// ── Claude Call ──────────────────────────────────────────────────────────────

interface ClaudeResponse {
  results: AnalysisResult[];
  tokensUsed: number;
}

async function callClaude(
  system: string,
  user: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<ClaudeResponse> {
  const client = getClient();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  const tokensUsed =
    (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);

  // Extract text from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse JSON response
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return { results: [], tokensUsed };
    return { results: parsed as AnalysisResult[], tokensUsed };
  } catch {
    console.error("[ai] Failed to parse Claude response as JSON:", text.slice(0, 200));
    return { results: [], tokensUsed };
  }
}

// ── Deduplication ───────────────────────────────────────────────────────────

/**
 * Check if a new insight is a duplicate of an existing one.
 * Uses title similarity + entity overlap within the same category.
 */
function isDuplicate(
  result: AnalysisResult,
  existing: { title: string; metadata: unknown }[]
): string | null {
  const newEntityIds = new Set(result.metadata?.entityIds ?? []);
  const newTitle = result.title.toLowerCase().trim();

  for (const ex of existing) {
    const exTitle = ex.title.toLowerCase().trim();
    const exMeta = ex.metadata as { entityIds?: string[]; category?: string } | null;
    const exEntityIds = new Set(exMeta?.entityIds ?? []);

    // Title similarity: check if titles share >60% of words
    const newWords = new Set(newTitle.split(/\s+/));
    const exWords = new Set(exTitle.split(/\s+/));
    const overlap = [...newWords].filter((w) => exWords.has(w)).length;
    const titleSimilarity = overlap / Math.max(newWords.size, exWords.size);

    // Entity overlap: check if >50% of entities match
    const entityOverlap = newEntityIds.size > 0 && exEntityIds.size > 0
      ? [...newEntityIds].filter((e) => exEntityIds.has(e)).length /
        Math.max(newEntityIds.size, exEntityIds.size)
      : 0;

    // Consider duplicate if title very similar OR both title somewhat similar + entity overlap
    if (titleSimilarity > 0.6 || (titleSimilarity > 0.4 && entityOverlap > 0.5)) {
      return exTitle;
    }
  }

  return null;
}

// ── Analysis Runner ─────────────────────────────────────────────────────────

type AnalysisCategory =
  | "usage_patterns"
  | "anomaly_detection"
  | "automation_gaps"
  | "efficiency";

const ANALYSIS_RUNNERS: Record<
  AnalysisCategory,
  (input: AnalysisInput) => { system: string; user: string }
> = {
  usage_patterns: buildUsagePatternsPrompt,
  anomaly_detection: buildAnomalyDetectionPrompt,
  automation_gaps: buildAutomationGapsPrompt,
  efficiency: buildEfficiencyPrompt,
};

/**
 * Run a specific analysis type for an instance.
 * Includes deduplication against recent insights.
 * Returns { count, tokensUsed }.
 */
export async function runAnalysis(
  instanceId: string,
  category: AnalysisCategory,
  analysisRunId?: string
): Promise<{ count: number; tokensUsed: number }> {
  const input = await gatherAnalysisInput(instanceId);

  // Skip if no meaningful data
  if (input.dailyStats.length === 0 && category !== "efficiency") {
    console.log(
      `[ai] Skipping ${category} for ${instanceId}: no daily stats`
    );
    return { count: 0, tokensUsed: 0 };
  }

  const builder = ANALYSIS_RUNNERS[category];
  const { system, user } = builder(input);

  // Use Haiku for anomaly detection (lightweight), Sonnet for the rest
  const model =
    category === "anomaly_detection"
      ? "claude-haiku-4-20250414"
      : "claude-sonnet-4-20250514";

  const { results, tokensUsed } = await callClaude(system, user, model);

  // Fetch recent insights for deduplication (last 30 days, same instance + category)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentInsights = await db
    .select({
      title: schema.aiAnalyses.title,
      metadata: schema.aiAnalyses.metadata,
    })
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.instanceId, instanceId),
        gte(schema.aiAnalyses.createdAt, thirtyDaysAgo),
        sql`${schema.aiAnalyses.metadata}->>'category' = ${category === "automation_gaps" ? "automation_gap" : category}`
      )
    );

  // Store results with dedup
  let storedCount = 0;
  for (const result of results) {
    const duplicateOf = isDuplicate(result, recentInsights);
    if (duplicateOf) {
      console.log(
        `[ai] Skipping duplicate insight: "${result.title}" (similar to "${duplicateOf}")`
      );
      continue;
    }

    await db.insert(schema.aiAnalyses).values({
      instanceId,
      analysisRunId: analysisRunId ?? null,
      type: result.type,
      title: result.title,
      content: result.content,
      metadata: result.metadata,
      status: "new",
    });

    // Add to recentInsights so subsequent results in this batch also dedup
    recentInsights.push({ title: result.title, metadata: result.metadata });
    storedCount++;
  }

  return { count: storedCount, tokensUsed };
}

/**
 * Run all analysis types for an instance.
 * Creates an analysis_run record for tracking.
 * Returns a summary of insights generated per category.
 */
export async function runAllAnalyses(
  instanceId: string
): Promise<Record<string, number>> {
  const categories: AnalysisCategory[] = [
    "usage_patterns",
    "anomaly_detection",
    "automation_gaps",
    "efficiency",
  ];

  // Create analysis run record
  const [run] = await db
    .insert(schema.analysisRuns)
    .values({
      instanceId,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  const results: Record<string, number> = {};
  let totalTokens = 0;

  for (const category of categories) {
    try {
      const { count, tokensUsed } = await runAnalysis(instanceId, category, run.id);
      results[category] = count;
      totalTokens += tokensUsed;
      console.log(
        `[ai] ${category}: generated ${count} insights for ${instanceId} (${tokensUsed} tokens)`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ai] ${category} failed for ${instanceId}:`, msg);
      results[category] = 0;
    }
  }

  // Update analysis run record
  await db
    .update(schema.analysisRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      insightsGenerated: results,
      tokensUsed: totalTokens,
    })
    .where(eq(schema.analysisRuns.id, run.id));

  return results;
}
