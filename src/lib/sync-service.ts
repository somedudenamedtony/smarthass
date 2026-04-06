import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { HAClient, HAState } from "@/lib/ha-client";

/**
 * Sync entity registry from HA into the database.
 * Pulls all current states, upserts entity records.
 */
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

    const data = {
      alias: (auto.attributes.friendly_name as string) ?? null,
      description: null as string | null,
      triggerConfig: (auto.attributes.trigger as unknown) ?? null,
      conditionConfig: (auto.attributes.condition as unknown) ?? null,
      actionConfig: (auto.attributes.action as unknown) ?? null,
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
 * Full sync: entities + automations + mark instance as synced.
 */
export async function fullSync(instanceId: string, client: HAClient) {
  const entityCount = await syncEntities(instanceId, client);
  const automationCount = await syncAutomations(instanceId, client);

  // Update last sync time
  await db
    .update(schema.haInstances)
    .set({ lastSyncAt: new Date(), status: "connected" })
    .where(eq(schema.haInstances.id, instanceId));

  return { entityCount, automationCount };
}
