import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { HAClient, HAState } from "@/lib/ha-client";

/**
 * Retry a function with exponential backoff.
 * @param fn - The async function to retry
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param baseDelayMs - Base delay in ms, doubles each retry (default: 1000)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        console.warn(
          `[sync] ${label} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
}

/**
 * Sync entity registry from HA into the database.
 * Pulls all current states, upserts entity records.
 */
// Domains that should be tracked by default for daily stats / analysis
const AUTO_TRACK_DOMAINS = new Set([
  "light", "switch", "climate", "binary_sensor", "cover", "fan",
  "lock", "media_player", "sensor", "input_boolean", "vacuum",
  "humidifier", "water_heater",
]);

export async function syncEntities(instanceId: string, client: HAClient) {
  const states = await client.getStates();

  for (const state of states) {
    const domain = state.entity_id.split(".")[0];

    const existing = await db
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(
        and(
          eq(schema.entities.instanceId, instanceId),
          eq(schema.entities.entityId, state.entity_id)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(schema.entities)
        .set({
          domain,
          friendlyName:
            (state.attributes.friendly_name as string) ?? null,
          areaId: (state.attributes.area_id as string) ?? null,
          deviceId: (state.attributes.device_id as string) ?? null,
          attributes: state.attributes,
          lastState: state.state,
          lastChangedAt: new Date(state.last_changed),
        })
        .where(eq(schema.entities.id, existing[0].id));
    } else {
      await db.insert(schema.entities).values({
        instanceId,
        entityId: state.entity_id,
        domain,
        platform: (state.attributes.platform as string) ?? null,
        friendlyName:
          (state.attributes.friendly_name as string) ?? null,
        areaId: (state.attributes.area_id as string) ?? null,
        deviceId: (state.attributes.device_id as string) ?? null,
        attributes: state.attributes,
        lastState: state.state,
        lastChangedAt: new Date(state.last_changed),
        isTracked: AUTO_TRACK_DOMAINS.has(domain),
      });
    }
  }

  return states.length;
}

/**
 * Sync automations from HA into the database.
 * Pulls automation entities and extracts their config.
 */
export async function syncAutomations(
  instanceId: string,
  client: HAClient
) {
  const states = await client.getStates();
  const automationStates = states.filter((s) =>
    s.entity_id.startsWith("automation.")
  );

  let count = 0;
  for (const auto of automationStates) {
    const existing = await db
      .select({ id: schema.automations.id })
      .from(schema.automations)
      .where(
        and(
          eq(schema.automations.instanceId, instanceId),
          eq(schema.automations.haAutomationId, auto.entity_id)
        )
      )
      .limit(1);

    // Fetch full automation config (triggers, conditions, actions) from HA
    let triggerConfig: unknown = null;
    let conditionConfig: unknown = null;
    let actionConfig: unknown = null;
    let description: string | null = null;

    const configId = auto.attributes.id as string | undefined;
    if (configId) {
      try {
        const config = await client.getAutomationConfig(configId);
        triggerConfig = config.triggers ?? config.trigger ?? null;
        conditionConfig = config.conditions ?? config.condition ?? null;
        actionConfig = config.actions ?? config.action ?? null;
        description = (config.description as string) || null;
      } catch {
        // Config endpoint may not be available — fall back to state attributes
        triggerConfig = (auto.attributes.trigger as unknown) ?? null;
        conditionConfig = (auto.attributes.condition as unknown) ?? null;
        actionConfig = (auto.attributes.action as unknown) ?? null;
      }
    }

    const data = {
      alias: (auto.attributes.friendly_name as string) ?? null,
      description,
      triggerConfig,
      conditionConfig,
      actionConfig,
      enabled: auto.state === "on",
      lastTriggered: auto.attributes.last_triggered
        ? new Date(auto.attributes.last_triggered as string)
        : null,
    };

    if (existing[0]) {
      await db
        .update(schema.automations)
        .set(data)
        .where(eq(schema.automations.id, existing[0].id));
    } else {
      await db.insert(schema.automations).values({
        instanceId,
        haAutomationId: auto.entity_id,
        ...data,
      });
    }
    count++;
  }

  return count;
}

/**
 * Compute daily stats for tracked entities from HA history data.
 * Pulls the last 24 hours of history for tracked entities and computes aggregates.
 */
export async function computeDailyStats(
  instanceId: string,
  client: HAClient
) {
  // Get tracked entities for this instance
  const trackedEntities = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
    })
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        eq(schema.entities.isTracked, true)
      )
    );

  if (trackedEntities.length === 0) return 0;

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);

  const endOfDay = new Date(yesterday);
  endOfDay.setHours(23, 59, 59, 999);

  const dateStr = yesterday.toISOString().split("T")[0];

  const entityIds = trackedEntities.map((e) => e.entityId);

  // Pull history for all tracked entities at once
  let historyData: HAState[][];
  try {
    historyData = await client.getHistory(
      yesterday.toISOString(),
      entityIds,
      endOfDay.toISOString()
    );
  } catch {
    console.error(
      `[daily-stats] Failed to fetch history for instance ${instanceId}`
    );
    return 0;
  }

  let statsCount = 0;

  for (const entityHistory of historyData) {
    if (!entityHistory.length) continue;

    const entityId = entityHistory[0].entity_id;
    const trackedEntity = trackedEntities.find(
      (e) => e.entityId === entityId
    );
    if (!trackedEntity) continue;

    // Compute stats
    const stateChanges = entityHistory.length - 1; // First entry is start state

    // Compute state distribution (time spent in each state)
    const stateDistribution: Record<string, number> = {};
    // Compute hourly activity (state changes per hour 0-23)
    const hourlyActivity: Record<string, number> = {};
    for (let h = 0; h < 24; h++) hourlyActivity[String(h)] = 0;
    let activeTime = 0;

    for (let i = 0; i < entityHistory.length; i++) {
      const current = entityHistory[i];
      const nextEntry = entityHistory[i + 1];
      const stateStart = new Date(current.last_changed).getTime();
      const stateEnd = nextEntry
        ? new Date(nextEntry.last_changed).getTime()
        : endOfDay.getTime();

      const duration = Math.max(0, Math.floor((stateEnd - stateStart) / 1000));

      stateDistribution[current.state] =
        (stateDistribution[current.state] || 0) + duration;

      // Count state change in the hour it occurred (skip first entry — it's the initial state)
      if (i > 0) {
        const hour = new Date(current.last_changed).getHours();
        hourlyActivity[String(hour)] = (hourlyActivity[String(hour)] || 0) + 1;
      }

      // "Active" states vary by domain
      const activeStates = ["on", "open", "playing", "home", "active"];
      if (activeStates.includes(current.state)) {
        activeTime += duration;
      }
    }

    // For sensor domains, compute numeric aggregates
    let avgValue: string | null = null;
    let minValue: string | null = null;
    let maxValue: string | null = null;

    if (trackedEntity.domain === "sensor") {
      const numericValues = entityHistory
        .map((s) => parseFloat(s.state))
        .filter((v) => !isNaN(v));

      if (numericValues.length > 0) {
        const sum = numericValues.reduce((a, b) => a + b, 0);
        avgValue = (sum / numericValues.length).toFixed(2);
        minValue = Math.min(...numericValues).toFixed(2);
        maxValue = Math.max(...numericValues).toFixed(2);
      }
    }

    // Check if stats already exist for this entity+date
    const existingStat = await db
      .select({ id: schema.entityDailyStats.id })
      .from(schema.entityDailyStats)
      .where(
        and(
          eq(schema.entityDailyStats.entityId, trackedEntity.id),
          eq(schema.entityDailyStats.date, dateStr)
        )
      )
      .limit(1);

    const statData = {
      stateChanges,
      activeTime,
      avgValue,
      minValue,
      maxValue,
      stateDistribution,
      hourlyActivity,
    };

    if (existingStat[0]) {
      await db
        .update(schema.entityDailyStats)
        .set(statData)
        .where(eq(schema.entityDailyStats.id, existingStat[0].id));
    } else {
      await db.insert(schema.entityDailyStats).values({
        entityId: trackedEntity.id,
        date: dateStr,
        ...statData,
      });
    }

    statsCount++;
  }

  return statsCount;
}

/**
 * Compute entity baselines from historical daily stats.
 * Groups stats by day-of-week and computes average/stddev for state changes and active time.
 * Requires at least 7 days of data per entity to produce meaningful baselines.
 */
export async function computeBaselines(instanceId: string) {
  // Get tracked entities
  const trackedEntities = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
    })
    .from(schema.entities)
    .where(
      and(
        eq(schema.entities.instanceId, instanceId),
        eq(schema.entities.isTracked, true)
      )
    );

  if (trackedEntities.length === 0) return 0;

  let baselineCount = 0;

  for (const entity of trackedEntities) {
    // Get all daily stats (last 60 days) grouped by day of week
    const stats = await db
      .select({
        date: schema.entityDailyStats.date,
        stateChanges: schema.entityDailyStats.stateChanges,
        activeTime: schema.entityDailyStats.activeTime,
      })
      .from(schema.entityDailyStats)
      .where(
        and(
          eq(schema.entityDailyStats.entityId, entity.id),
          sql`${schema.entityDailyStats.date} >= ${new Date(Date.now() - 60 * 86400000).toISOString().split("T")[0]}`
        )
      );

    if (stats.length < 7) continue; // Not enough data for baselines

    // Group by day of week (0=Sunday)
    const byDay = new Map<number, { changes: number[]; active: number[] }>();
    for (const s of stats) {
      const dayOfWeek = new Date(s.date + "T12:00:00Z").getUTCDay();
      const bucket = byDay.get(dayOfWeek) || { changes: [], active: [] };
      bucket.changes.push(s.stateChanges);
      bucket.active.push(s.activeTime);
      byDay.set(dayOfWeek, bucket);
    }

    // Compute averages and stddev per day
    for (const [dayOfWeek, bucket] of byDay) {
      const avgChanges = bucket.changes.reduce((a, b) => a + b, 0) / bucket.changes.length;
      const avgActive = bucket.active.reduce((a, b) => a + b, 0) / bucket.active.length;
      const stdDevChanges = bucket.changes.length > 1
        ? Math.sqrt(
            bucket.changes.reduce((sum, v) => sum + (v - avgChanges) ** 2, 0) /
              (bucket.changes.length - 1)
          )
        : 0;

      // Upsert baseline
      const existing = await db
        .select({ id: schema.entityBaselines.id })
        .from(schema.entityBaselines)
        .where(
          and(
            eq(schema.entityBaselines.entityId, entity.id),
            eq(schema.entityBaselines.dayOfWeek, dayOfWeek)
          )
        )
        .limit(1);

      const data = {
        avgStateChanges: avgChanges.toFixed(2),
        avgActiveTime: avgActive.toFixed(2),
        stdDevStateChanges: stdDevChanges.toFixed(2),
        computedAt: new Date(),
      };

      if (existing[0]) {
        await db
          .update(schema.entityBaselines)
          .set(data)
          .where(eq(schema.entityBaselines.id, existing[0].id));
      } else {
        await db.insert(schema.entityBaselines).values({
          entityId: entity.id,
          dayOfWeek,
          ...data,
        });
      }
      baselineCount++;
    }
  }

  return baselineCount;
}

/**
 * Full sync: entities + automations + daily stats + mark instance as synced.
 */
export async function fullSync(instanceId: string, client: HAClient) {
  const entityCount = await syncEntities(instanceId, client);
  const automationCount = await syncAutomations(instanceId, client);
  const statsCount = await computeDailyStats(instanceId, client);

  // Update last sync time
  await db
    .update(schema.haInstances)
    .set({ lastSyncAt: new Date(), status: "connected" })
    .where(eq(schema.haInstances.id, instanceId));

  return { entityCount, automationCount, statsCount };
}

/**
 * Reconciliation sync: lightweight sync used when WebSocket continuous sync is active.
 * - Syncs entities from REST (picks up new entities WS hasn't seen)
 * - Syncs automations (not streamed via WS state_changed events)
 * - Computes baselines from historical stats
 * - Skips computeDailyStats since the StateAggregator handles that in real-time
 */
export async function reconcileSync(instanceId: string, client: HAClient) {
  const entityCount = await syncEntities(instanceId, client);
  const automationCount = await syncAutomations(instanceId, client);
  const baselineCount = await computeBaselines(instanceId);

  // Update last sync time
  await db
    .update(schema.haInstances)
    .set({ lastSyncAt: new Date(), status: "connected" })
    .where(eq(schema.haInstances.id, instanceId));

  return { entityCount, automationCount, baselineCount, statsSkipped: true };
}
