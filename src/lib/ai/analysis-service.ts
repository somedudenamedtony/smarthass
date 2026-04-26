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
  buildCrossDeviceCorrelationPrompt,
  buildDeviceSuggestionPrompt,
  buildUsageAndEfficiencyPrompt,
  buildAutomationAndCorrelationPrompt,
  buildAutomationReviewPrompt,
  estimateTokens,
  filterInputByRelevance,
} from "./prompts";
import { createHash } from "crypto";
import { getAnthropicApiKey } from "@/lib/app-config";

// ── Client ──────────────────────────────────────────────────────────────────

async function getClient() {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) throw new Error("Anthropic API key is not configured. Add it in Settings.");
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

  const windowDays = instance?.analysisWindowDays ?? 7;

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
      hourlyActivity: schema.entityDailyStats.hourlyActivity,
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
    hourlyActivity: s.hourlyActivity as Record<string, number> | null,
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

// ── Delta Detection ─────────────────────────────────────────────────────────

function computeAnalysisHash(input: AnalysisInput): string {
  const data = input.dailyStats
    .map((s) => `${s.entityId}:${s.date}:${s.stateChanges}:${s.activeTime}`)
    .sort()
    .join("|");
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

async function hasDataChanged(instanceId: string, newHash: string): Promise<boolean> {
  const [instance] = await db
    .select({ lastAnalysisHash: schema.haInstances.lastAnalysisHash })
    .from(schema.haInstances)
    .where(eq(schema.haInstances.id, instanceId))
    .limit(1);

  return instance?.lastAnalysisHash !== newHash;
}

async function updateAnalysisHash(instanceId: string, hash: string): Promise<void> {
  await db
    .update(schema.haInstances)
    .set({ lastAnalysisHash: hash })
    .where(eq(schema.haInstances.id, instanceId));
}

// ── Claude Call ──────────────────────────────────────────────────────────────

const MAX_INPUT_TOKENS = 30_000;

interface ClaudeResponse {
  results: AnalysisResult[];
  tokensUsed: number;
}

async function callClaude(
  system: string,
  user: string,
  model: string = "claude-haiku-4-5"
): Promise<ClaudeResponse> {
  const client = await getClient();

  // Token budget check — truncate user prompt if too large
  const estimatedInput = estimateTokens(system + user);
  let userPrompt = user;
  if (estimatedInput > MAX_INPUT_TOKENS) {
    const maxUserChars = (MAX_INPUT_TOKENS - estimateTokens(system)) * 4;
    userPrompt = user.slice(0, maxUserChars) + "\n\n[Data truncated to fit token budget]";
    console.log(
      `[ai] Truncated prompt from ~${estimatedInput} to ~${MAX_INPUT_TOKENS} estimated tokens`
    );
  }

  console.log(
    `[ai] Calling ${model} — estimated ~${estimateTokens(system + userPrompt)} input tokens`
  );

  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    // Use prompt caching for system prompt (identical across runs)
    system: [
      {
        type: "text" as const,
        text: system,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  const cacheRead = (response.usage as unknown as Record<string, number>)?.cache_read_input_tokens ?? 0;
  const tokensUsed = inputTokens + outputTokens;

  console.log(
    `[ai] Response: ${inputTokens} input (${cacheRead} cached), ${outputTokens} output = ${tokensUsed} total`
  );

  // Extract text from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse JSON response — strip markdown fences if present
  let cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return { results: [], tokensUsed };
    return { results: parsed as AnalysisResult[], tokensUsed };
  } catch {
    // If response was truncated (hit max_tokens), try to salvage valid items
    if (response.stop_reason === "max_tokens" && cleaned.startsWith("[")) {
      console.warn("[ai] Response truncated — attempting to salvage partial JSON");
      // Find the last complete object by finding last "},"  or "}" before end
      const lastComplete = cleaned.lastIndexOf("},");
      if (lastComplete > 0) {
        const salvaged = cleaned.slice(0, lastComplete + 1) + "]";
        try {
          const parsed = JSON.parse(salvaged);
          if (Array.isArray(parsed)) {
            console.log(`[ai] Salvaged ${parsed.length} results from truncated response`);
            return { results: parsed as AnalysisResult[], tokensUsed };
          }
        } catch { /* fall through */ }
      }
    }
    console.error("[ai] Failed to parse Claude response as JSON:", text.slice(0, 200));
    return { results: [], tokensUsed };
  }
}

// ── Batch API (50% discount, for cron/background use) ───────────────────────

interface BatchRequest {
  customId: string;
  system: string;
  user: string;
  model: string;
}

async function submitBatch(requests: BatchRequest[]): Promise<string> {
  const client = await getClient();

  const batch = await client.messages.batches.create({
    requests: requests.map((r) => ({
      custom_id: r.customId,
      params: {
        model: r.model,
        max_tokens: 8192,
        system: [
          {
            type: "text" as const,
            text: r.system,
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [{ role: "user" as const, content: r.user }],
      },
    })),
  });

  console.log(`[ai] Batch submitted: ${batch.id} (${requests.length} requests)`);
  return batch.id;
}

async function pollBatchResults(
  batchId: string,
  maxWaitMs: number = 3600_000
): Promise<Map<string, ClaudeResponse>> {
  const client = await getClient();
  const startTime = Date.now();
  const pollInterval = 30_000;

  while (Date.now() - startTime < maxWaitMs) {
    const batch = await client.messages.batches.retrieve(batchId);

    if (batch.processing_status === "ended") {
      console.log(
        `[ai] Batch ${batchId} ended: ${batch.request_counts.succeeded} succeeded, ` +
        `${batch.request_counts.errored} errored, ${batch.request_counts.expired} expired`
      );

      const resultsMap = new Map<string, ClaudeResponse>();
      const decoder = await client.messages.batches.results(batchId);

      for await (const item of decoder) {
        if (item.result.type === "succeeded") {
          const msg = item.result.message;
          const text = msg.content
            .filter((block): block is Anthropic.TextBlock => block.type === "text")
            .map((block) => block.text)
            .join("");

          const tokensUsed = (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0);

          // Strip markdown fences if present
          const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
          try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed)) {
              resultsMap.set(item.custom_id, { results: parsed as AnalysisResult[], tokensUsed });
            } else {
              resultsMap.set(item.custom_id, { results: [], tokensUsed });
            }
          } catch {
            console.error(`[ai] Failed to parse batch result ${item.custom_id}:`, text.slice(0, 200));
            resultsMap.set(item.custom_id, { results: [], tokensUsed });
          }
        } else {
          console.error(`[ai] Batch request ${item.custom_id} failed: ${item.result.type}`);
          resultsMap.set(item.custom_id, { results: [], tokensUsed: 0 });
        }
      }

      return resultsMap;
    }

    console.log(`[ai] Batch ${batchId} still processing (${batch.request_counts.processing} remaining)...`);
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout: attempt to cancel the batch so we don't accumulate costs
  console.error(`[ai] Batch ${batchId} timed out after ${maxWaitMs}ms — attempting to cancel`);
  try {
    await client.messages.batches.cancel(batchId);
    console.log(`[ai] Batch ${batchId} cancel requested`);
  } catch (cancelErr) {
    console.error(`[ai] Failed to cancel batch ${batchId}:`, cancelErr);
  }
  return new Map();
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
    if (titleSimilarity > 0.7 || (titleSimilarity > 0.5 && entityOverlap > 0.6)) {
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
  | "efficiency"
  | "cross_device_correlation"
  | "device_suggestions"
  | "automation_review";

const ANALYSIS_RUNNERS: Record<
  AnalysisCategory,
  (input: AnalysisInput) => { system: string; user: string }
> = {
  usage_patterns: buildUsagePatternsPrompt,
  anomaly_detection: buildAnomalyDetectionPrompt,
  automation_gaps: buildAutomationGapsPrompt,
  efficiency: buildEfficiencyPrompt,
  cross_device_correlation: buildCrossDeviceCorrelationPrompt,
  device_suggestions: buildDeviceSuggestionPrompt,
  automation_review: buildAutomationReviewPrompt,
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
  const rawInput = await gatherAnalysisInput(instanceId);

  // Filter to top-N relevant entities to control token usage
  const input = filterInputByRelevance(rawInput, 25);

  // Skip if no meaningful data at all
  const hasEntities = input.entities.length > 0;
  const hasDailyStats = input.dailyStats.length > 0;

  // Categories that can run with just entity/automation data (no daily stats required)
  const entityOnlyCategories: AnalysisCategory[] = [
    "efficiency",
    "automation_gaps",
    "device_suggestions",
    "cross_device_correlation",
    "automation_review",
  ];

  if (!hasDailyStats && !entityOnlyCategories.includes(category)) {
    console.log(
      `[ai] Skipping ${category} for ${instanceId}: no daily stats`
    );
    return { count: 0, tokensUsed: 0 };
  }

  if (!hasEntities) {
    console.log(
      `[ai] Skipping ${category} for ${instanceId}: no entities`
    );
    return { count: 0, tokensUsed: 0 };
  }

  const builder = ANALYSIS_RUNNERS[category];
  const { system, user } = builder(input);

  // Use Haiku for all categories (cost-optimized — Haiku 4.5 handles structured JSON well)
  const model = "claude-haiku-4-5";

  const { results, tokensUsed } = await callClaude(system, user, model);

  // Fetch recent insights for deduplication (last 30 days, same instance + category)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const categoryFilter =
    category === "automation_gaps" ? "automation_gap" :
    category === "cross_device_correlation" ? "cross_device_correlation" :
    category === "device_suggestions" ? "device_suggestion" :
    category === "automation_review" ? "automation_review" :
    category;

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
        sql`${schema.aiAnalyses.metadata}->>'category' = ${categoryFilter}`
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
 * Run all analysis types for an instance using merged prompts.
 * Reduces from 6 API calls to 4 by combining related categories:
 *   1. usage_patterns + efficiency (merged)
 *   2. anomaly_detection (standalone, Haiku)
 *   3. automation_gaps + cross_device_correlation (merged)
 *   4. device_suggestions (standalone)
 *
 * Creates an analysis_run record for tracking.
 * Returns a summary of insights generated per category.
 */
export async function runAllAnalyses(
  instanceId: string
): Promise<Record<string, number>> {
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

  // Gather input once and filter by relevance (shared across all calls)
  const rawInput = await gatherAnalysisInput(instanceId);
  const input = filterInputByRelevance(rawInput, 25);

  const hasEntities = input.entities.length > 0;
  const hasDailyStats = input.dailyStats.length > 0;

  if (!hasEntities) {
    console.log(`[ai] Skipping all analyses for ${instanceId}: no entities`);
    await db
      .update(schema.analysisRuns)
      .set({ status: "completed", completedAt: new Date(), insightsGenerated: results, tokensUsed: 0 })
      .where(eq(schema.analysisRuns.id, run.id));
    return results;
  }

  // Dedup helper: fetch recent insights and store new ones
  async function storeResults(
    analysisResults: AnalysisResult[],
    categoryFilters: string[]
  ): Promise<Record<string, number>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInsights = await db
      .select({ title: schema.aiAnalyses.title, metadata: schema.aiAnalyses.metadata })
      .from(schema.aiAnalyses)
      .where(
        and(
          eq(schema.aiAnalyses.instanceId, instanceId),
          gte(schema.aiAnalyses.createdAt, thirtyDaysAgo),
          sql`${schema.aiAnalyses.metadata}->>'category' IN (${sql.join(
            categoryFilters.map((c) => sql`${c}`),
            sql`, `
          )})`
        )
      );

    const counts: Record<string, number> = {};
    for (const cat of categoryFilters) counts[cat] = 0;

    for (const result of analysisResults) {
      const duplicateOf = isDuplicate(result, recentInsights);
      if (duplicateOf) {
        console.log(`[ai] Skipping duplicate: "${result.title}" (similar to "${duplicateOf}")`);
        continue;
      }

      await db.insert(schema.aiAnalyses).values({
        instanceId,
        analysisRunId: run.id,
        type: result.type,
        title: result.title,
        content: result.content,
        metadata: result.metadata,
        status: "new",
      });

      recentInsights.push({ title: result.title, metadata: result.metadata });
      const cat = (result.metadata as { category?: string })?.category;
      if (cat && cat in counts) counts[cat]++;
    }

    return counts;
  }

  // ── Call 1: Usage Patterns + Efficiency (merged, Haiku) ───────────────
  if (hasDailyStats) {
    try {
      const { system, user } = buildUsageAndEfficiencyPrompt(input);
      const { results: r, tokensUsed } = await callClaude(
        system, user, "claude-haiku-4-5"
      );
      const counts = await storeResults(r, ["usage_pattern", "efficiency"]);
      results.usage_patterns = counts.usage_pattern ?? 0;
      results.efficiency = counts.efficiency ?? 0;
      totalTokens += tokensUsed;
      console.log(
        `[ai] usage+efficiency: ${results.usage_patterns}+${results.efficiency} insights (${tokensUsed} tokens)`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ai] usage+efficiency failed:`, msg);
      results.usage_patterns = 0;
      results.efficiency = 0;
    }
  }

  // ── Call 2: Anomaly Detection (standalone, Haiku) ─────────────────────
  if (hasDailyStats) {
    try {
      const { system, user } = buildAnomalyDetectionPrompt(input);
      const { results: r, tokensUsed } = await callClaude(
        system, user, "claude-haiku-4-5"
      );
      const counts = await storeResults(r, ["anomaly_detection"]);
      results.anomaly_detection = counts.anomaly_detection ?? 0;
      totalTokens += tokensUsed;
      console.log(
        `[ai] anomaly_detection: ${results.anomaly_detection} insights (${tokensUsed} tokens)`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ai] anomaly_detection failed:`, msg);
      results.anomaly_detection = 0;
    }
  }

  // ── Call 3: Automation Gaps + Cross-Device (merged, Sonnet) ───────────
  try {
    const { system, user } = buildAutomationAndCorrelationPrompt(input);
    const { results: r, tokensUsed } = await callClaude(system, user, "claude-haiku-4-5");
    const counts = await storeResults(r, ["automation_gap", "cross_device_correlation"]);
    results.automation_gaps = counts.automation_gap ?? 0;
    results.cross_device_correlation = counts.cross_device_correlation ?? 0;
    totalTokens += tokensUsed;
    console.log(
      `[ai] automation+correlation: ${results.automation_gaps}+${results.cross_device_correlation} insights (${tokensUsed} tokens)`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ai] automation+correlation failed:`, msg);
    results.automation_gaps = 0;
    results.cross_device_correlation = 0;
  }

  // ── Call 4: Device Suggestions (standalone, Haiku) ────────────────────
  try {
    const { system, user } = buildDeviceSuggestionPrompt(input);
    const { results: r, tokensUsed } = await callClaude(
      system, user, "claude-haiku-4-5"
    );
    const counts = await storeResults(r, ["device_suggestion"]);
    results.device_suggestions = counts.device_suggestion ?? 0;
    totalTokens += tokensUsed;
    console.log(
      `[ai] device_suggestions: ${results.device_suggestions} insights (${tokensUsed} tokens)`
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error(`[ai] device_suggestions failed:`, msg);
    results.device_suggestions = 0;
  }

  // ── Call 5: Automation Review (standalone, Sonnet) ────────────────────
  if (input.automations.length > 0) {
    try {
      const { system, user } = buildAutomationReviewPrompt(input);
      const { results: r, tokensUsed } = await callClaude(system, user, "claude-haiku-4-5");
      const counts = await storeResults(r, ["automation_review"]);
      results.automation_review = counts.automation_review ?? 0;
      totalTokens += tokensUsed;
      console.log(
        `[ai] automation_review: ${results.automation_review} insights (${tokensUsed} tokens)`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ai] automation_review failed:`, msg);
      results.automation_review = 0;
    }
  }

  console.log(
    `[ai] All analyses complete for ${instanceId}: ${totalTokens} total tokens used`
  );

  // Update hash for delta detection
  const hash = computeAnalysisHash(input);
  await updateAnalysisHash(instanceId, hash);

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

/**
 * Run all analyses using the Batch API (50% cost discount).
 * Used for cron/background jobs where real-time response is not needed.
 * Includes delta-based skipping: if data hasn't changed, skip entirely.
 */
export async function runAllAnalysesBatch(
  instanceId: string
): Promise<{ batchId: string | null; skipped: boolean; results?: Record<string, number> }> {
  const rawInput = await gatherAnalysisInput(instanceId);
  const input = filterInputByRelevance(rawInput, 25);

  // Delta check: skip if data hasn't changed
  const hash = computeAnalysisHash(input);
  const changed = await hasDataChanged(instanceId, hash);
  if (!changed) {
    console.log(`[ai] Skipping batch analysis for ${instanceId}: data unchanged (hash=${hash})`);
    return { batchId: null, skipped: true };
  }

  const hasEntities = input.entities.length > 0;
  const hasDailyStats = input.dailyStats.length > 0;

  if (!hasEntities) {
    console.log(`[ai] Skipping batch analysis for ${instanceId}: no entities`);
    return { batchId: null, skipped: true };
  }

  // Create analysis run record
  const [run] = await db
    .insert(schema.analysisRuns)
    .values({
      instanceId,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  // Build all prompts
  const batchRequests: BatchRequest[] = [];

  if (hasDailyStats) {
    const ue = buildUsageAndEfficiencyPrompt(input);
    batchRequests.push({
      customId: `${run.id}:usage_efficiency`,
      system: ue.system,
      user: ue.user,
      model: "claude-haiku-4-5",
    });

    const ad = buildAnomalyDetectionPrompt(input);
    batchRequests.push({
      customId: `${run.id}:anomaly_detection`,
      system: ad.system,
      user: ad.user,
      model: "claude-haiku-4-5",
    });
  }

  const ac = buildAutomationAndCorrelationPrompt(input);
  batchRequests.push({
    customId: `${run.id}:automation_correlation`,
    system: ac.system,
    user: ac.user,
    model: "claude-haiku-4-5",
  });

  const ds = buildDeviceSuggestionPrompt(input);
  batchRequests.push({
    customId: `${run.id}:device_suggestions`,
    system: ds.system,
    user: ds.user,
    model: "claude-haiku-4-5",
  });

  // Automation review (only if automations exist)
  if (input.automations.length > 0) {
    const ar = buildAutomationReviewPrompt(input);
    batchRequests.push({
      customId: `${run.id}:automation_review`,
      system: ar.system,
      user: ar.user,
      model: "claude-haiku-4-5",
    });
  }

  // Apply token budget to each request
  for (const req of batchRequests) {
    const estimated = estimateTokens(req.system + req.user);
    if (estimated > MAX_INPUT_TOKENS) {
      const maxUserChars = (MAX_INPUT_TOKENS - estimateTokens(req.system)) * 4;
      req.user = req.user.slice(0, maxUserChars) + "\n\n[Data truncated to fit token budget]";
      console.log(`[ai] Truncated batch request ${req.customId} to fit budget`);
    }
  }

  // Submit batch
  const batchId = await submitBatch(batchRequests);

  // Poll for results (up to 1 hour for cron context)
  const batchResults = await pollBatchResults(batchId);

  // If polling timed out, batchResults will be empty — mark run as failed
  if (batchResults.size === 0) {
    console.error(`[ai] Batch ${batchId} returned no results (likely timed out)`);
    await db
      .update(schema.analysisRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        error: `Batch ${batchId} timed out after polling — no results received`,
        tokensUsed: 0,
      })
      .where(eq(schema.analysisRuns.id, run.id));
    return { batchId, skipped: false, results: {} };
  }

  // Process results
  const results: Record<string, number> = {};
  let totalTokens = 0;

  // Dedup helper
  async function storeBatchResults(
    analysisResults: AnalysisResult[],
    categoryFilters: string[]
  ): Promise<Record<string, number>> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentInsights = await db
      .select({ title: schema.aiAnalyses.title, metadata: schema.aiAnalyses.metadata })
      .from(schema.aiAnalyses)
      .where(
        and(
          eq(schema.aiAnalyses.instanceId, instanceId),
          gte(schema.aiAnalyses.createdAt, thirtyDaysAgo),
          sql`${schema.aiAnalyses.metadata}->>'category' IN (${sql.join(
            categoryFilters.map((c) => sql`${c}`),
            sql`, `
          )})`
        )
      );

    const counts: Record<string, number> = {};
    for (const cat of categoryFilters) counts[cat] = 0;

    for (const result of analysisResults) {
      const duplicateOf = isDuplicate(result, recentInsights);
      if (duplicateOf) {
        console.log(`[ai] Skipping duplicate: "${result.title}" (similar to "${duplicateOf}")`);
        continue;
      }

      await db.insert(schema.aiAnalyses).values({
        instanceId,
        analysisRunId: run.id,
        type: result.type,
        title: result.title,
        content: result.content,
        metadata: result.metadata,
        status: "new",
      });

      recentInsights.push({ title: result.title, metadata: result.metadata });
      const cat = (result.metadata as { category?: string })?.category;
      if (cat && cat in counts) counts[cat]++;
    }

    return counts;
  }

  // Process usage+efficiency
  const ueResult = batchResults.get(`${run.id}:usage_efficiency`);
  if (ueResult) {
    const counts = await storeBatchResults(ueResult.results, ["usage_pattern", "efficiency"]);
    results.usage_patterns = counts.usage_pattern ?? 0;
    results.efficiency = counts.efficiency ?? 0;
    totalTokens += ueResult.tokensUsed;
  }

  // Process anomaly detection
  const adResult = batchResults.get(`${run.id}:anomaly_detection`);
  if (adResult) {
    const counts = await storeBatchResults(adResult.results, ["anomaly_detection"]);
    results.anomaly_detection = counts.anomaly_detection ?? 0;
    totalTokens += adResult.tokensUsed;
  }

  // Process automation+correlation
  const acResult = batchResults.get(`${run.id}:automation_correlation`);
  if (acResult) {
    const counts = await storeBatchResults(acResult.results, ["automation_gap", "cross_device_correlation"]);
    results.automation_gaps = counts.automation_gap ?? 0;
    results.cross_device_correlation = counts.cross_device_correlation ?? 0;
    totalTokens += acResult.tokensUsed;
  }

  // Process device suggestions
  const dsResult = batchResults.get(`${run.id}:device_suggestions`);
  if (dsResult) {
    const counts = await storeBatchResults(dsResult.results, ["device_suggestion"]);
    results.device_suggestions = counts.device_suggestion ?? 0;
    totalTokens += dsResult.tokensUsed;
  }

  // Process automation review
  const arResult = batchResults.get(`${run.id}:automation_review`);
  if (arResult) {
    const counts = await storeBatchResults(arResult.results, ["automation_review"]);
    results.automation_review = counts.automation_review ?? 0;
    totalTokens += arResult.tokensUsed;
  }

  // Update hash and run record
  await updateAnalysisHash(instanceId, hash);
  await db
    .update(schema.analysisRuns)
    .set({
      status: "completed",
      completedAt: new Date(),
      insightsGenerated: results,
      tokensUsed: totalTokens,
    })
    .where(eq(schema.analysisRuns.id, run.id));

  console.log(
    `[ai] Batch analysis complete for ${instanceId}: ${totalTokens} total tokens (50% batch discount applied)`
  );

  return { batchId, skipped: false, results };
}
