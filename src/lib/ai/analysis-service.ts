import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type {
  AnalysisInput,
  AnalysisResult,
  EntitySnapshot,
  AutomationSnapshot,
  DailyStatSnapshot,
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

  // Daily stats (last 14 days for tracked entities)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const cutoff = fourteenDaysAgo.toISOString().split("T")[0];

  const statsRaw = await db
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
        sql`${schema.entityDailyStats.date} >= ${cutoff}`
      )
    )
    .orderBy(schema.entities.entityId, desc(schema.entityDailyStats.date));

  const dailyStats: DailyStatSnapshot[] = statsRaw.map((s) => ({
    ...s,
    stateDistribution: s.stateDistribution as Record<string, number> | null,
  }));

  return { instanceId, entities, automations, dailyStats };
}

// ── Claude Call ──────────────────────────────────────────────────────────────

async function callClaude(
  system: string,
  user: string,
  model: string = "claude-sonnet-4-20250514"
): Promise<AnalysisResult[]> {
  const client = getClient();

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: user }],
  });

  // Extract text from response
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  // Parse JSON response
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed as AnalysisResult[];
  } catch {
    console.error("[ai] Failed to parse Claude response as JSON:", text.slice(0, 200));
    return [];
  }
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
 * Returns the number of insights stored.
 */
export async function runAnalysis(
  instanceId: string,
  category: AnalysisCategory
): Promise<number> {
  const input = await gatherAnalysisInput(instanceId);

  // Skip if no meaningful data
  if (input.dailyStats.length === 0 && category !== "efficiency") {
    console.log(
      `[ai] Skipping ${category} for ${instanceId}: no daily stats`
    );
    return 0;
  }

  const builder = ANALYSIS_RUNNERS[category];
  const { system, user } = builder(input);

  // Use Haiku for anomaly detection (lightweight), Sonnet for the rest
  const model =
    category === "anomaly_detection"
      ? "claude-haiku-4-20250414"
      : "claude-sonnet-4-20250514";

  const results = await callClaude(system, user, model);

  // Store results
  for (const result of results) {
    await db.insert(schema.aiAnalyses).values({
      instanceId,
      type: result.type,
      title: result.title,
      content: result.content,
      metadata: result.metadata,
      status: "new",
    });
  }

  return results.length;
}

/**
 * Run all analysis types for an instance.
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

  const results: Record<string, number> = {};

  for (const category of categories) {
    try {
      results[category] = await runAnalysis(instanceId, category);
      console.log(
        `[ai] ${category}: generated ${results[category]} insights for ${instanceId}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(`[ai] ${category} failed for ${instanceId}:`, msg);
      results[category] = 0;
    }
  }

  return results;
}
