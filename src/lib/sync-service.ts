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

  // If the end-of-day is in the future (install happened today),
  // use "now" as the end time and compute stats for today
  const effectiveEnd = endOfDay > now ? now : endOfDay;
  const effectiveStart = endOfDay > now
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    : yesterday;

  const dateStr = effectiveStart.toISOString().split("T")[0];

  const entityIds = trackedEntities.map((e) => e.entityId);

  // Fetch history in batches to avoid URL length limits
  const BATCH_SIZE = 50;
  let historyData: HAState[][] = [];

  for (let i = 0; i < entityIds.length; i += BATCH_SIZE) {
    const batch = entityIds.slice(i, i + BATCH_SIZE);
    try {
      const batchHistory = await client.getHistory(
        effectiveStart.toISOString(),
        batch,
        effectiveEnd.toISOString()
      );
      historyData = historyData.concat(batchHistory);
    } catch (err) {
      console.error(
        `[daily-stats] Failed to fetch history batch ${Math.floor(i / BATCH_SIZE) + 1} for instance ${instanceId}:`,
        err instanceof Error ? err.message : err
      );
      // Continue with other batches
    }
  }

  if (historyData.length === 0) return 0;

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
        : effectiveEnd.getTime();

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

// ─── Phase 3: Area, Device, Scene, Script Sync ────────────────────────────────

/**
 * Sync areas from HA's area registry.
 * Uses the WebSocket API to fetch the area registry.
 */
export async function syncAreas(instanceId: string, client: HAClient) {
  // Areas are not exposed via REST API, so we need to extract them from entity attributes
  // or use the WebSocket config/area_registry/list command
  // For now, we'll extract unique area_id values from entities
  
  const states = await client.getStates();
  const areaMap = new Map<string, { id: string; name: string }>();
  
  for (const state of states) {
    const areaId = state.attributes.area_id as string | undefined;
    if (areaId && !areaMap.has(areaId)) {
      // Try to get a friendly name from device registry or use the ID
      const name = areaId.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      areaMap.set(areaId, { id: areaId, name });
    }
  }
  
  let count = 0;
  for (const [haAreaId, areaInfo] of areaMap) {
    const existing = await db
      .select({ id: schema.areas.id })
      .from(schema.areas)
      .where(
        and(
          eq(schema.areas.instanceId, instanceId),
          eq(schema.areas.haAreaId, haAreaId)
        )
      )
      .limit(1);
    
    if (existing[0]) {
      await db
        .update(schema.areas)
        .set({ name: areaInfo.name })
        .where(eq(schema.areas.id, existing[0].id));
    } else {
      await db.insert(schema.areas).values({
        instanceId,
        haAreaId,
        name: areaInfo.name,
      });
    }
    count++;
  }
  
  return count;
}

/**
 * Sync devices from HA entities.
 * Extracts device information from entity attributes.
 */
export async function syncDevices(instanceId: string, client: HAClient) {
  const states = await client.getStates();
  const deviceMap = new Map<string, {
    id: string;
    name: string;
    manufacturer?: string;
    model?: string;
    areaId?: string;
  }>();
  
  for (const state of states) {
    const deviceId = state.attributes.device_id as string | undefined;
    if (deviceId && !deviceMap.has(deviceId)) {
      deviceMap.set(deviceId, {
        id: deviceId,
        name: (state.attributes.device_name as string) || 
              (state.attributes.friendly_name as string) || 
              deviceId,
        manufacturer: state.attributes.manufacturer as string | undefined,
        model: state.attributes.model as string | undefined,
        areaId: state.attributes.area_id as string | undefined,
      });
    }
  }
  
  let count = 0;
  for (const [haDeviceId, deviceInfo] of deviceMap) {
    const existing = await db
      .select({ id: schema.devices.id })
      .from(schema.devices)
      .where(
        and(
          eq(schema.devices.instanceId, instanceId),
          eq(schema.devices.haDeviceId, haDeviceId)
        )
      )
      .limit(1);
    
    const data = {
      name: deviceInfo.name,
      manufacturer: deviceInfo.manufacturer ?? null,
      model: deviceInfo.model ?? null,
      areaId: deviceInfo.areaId ?? null,
    };
    
    if (existing[0]) {
      await db
        .update(schema.devices)
        .set(data)
        .where(eq(schema.devices.id, existing[0].id));
    } else {
      await db.insert(schema.devices).values({
        instanceId,
        haDeviceId,
        ...data,
      });
    }
    count++;
  }
  
  return count;
}

/**
 * Sync scenes from HA.
 */
export async function syncScenes(instanceId: string, client: HAClient) {
  const states = await client.getStates();
  const sceneStates = states.filter((s) => s.entity_id.startsWith("scene."));
  
  let count = 0;
  for (const scene of sceneStates) {
    const existing = await db
      .select({ id: schema.scenes.id })
      .from(schema.scenes)
      .where(
        and(
          eq(schema.scenes.instanceId, instanceId),
          eq(schema.scenes.entityId, scene.entity_id)
        )
      )
      .limit(1);
    
    const data = {
      name: (scene.attributes.friendly_name as string) || scene.entity_id,
      icon: (scene.attributes.icon as string) ?? null,
      areaId: (scene.attributes.area_id as string) ?? null,
      entityIds: scene.attributes.entity_id as string[] | undefined,
    };
    
    if (existing[0]) {
      await db
        .update(schema.scenes)
        .set(data)
        .where(eq(schema.scenes.id, existing[0].id));
    } else {
      await db.insert(schema.scenes).values({
        instanceId,
        entityId: scene.entity_id,
        ...data,
      });
    }
    count++;
  }
  
  return count;
}

/**
 * Sync scripts from HA.
 */
export async function syncScripts(instanceId: string, client: HAClient) {
  const states = await client.getStates();
  const scriptStates = states.filter((s) => s.entity_id.startsWith("script."));
  
  let count = 0;
  for (const script of scriptStates) {
    const existing = await db
      .select({ id: schema.scripts.id })
      .from(schema.scripts)
      .where(
        and(
          eq(schema.scripts.instanceId, instanceId),
          eq(schema.scripts.entityId, script.entity_id)
        )
      )
      .limit(1);
    
    const data = {
      name: (script.attributes.friendly_name as string) || script.entity_id,
      icon: (script.attributes.icon as string) ?? null,
      description: (script.attributes.description as string) ?? null,
      mode: (script.attributes.mode as string) ?? null,
      lastTriggered: script.attributes.last_triggered
        ? new Date(script.attributes.last_triggered as string)
        : null,
    };
    
    if (existing[0]) {
      await db
        .update(schema.scripts)
        .set(data)
        .where(eq(schema.scripts.id, existing[0].id));
    } else {
      await db.insert(schema.scripts).values({
        instanceId,
        entityId: script.entity_id,
        ...data,
      });
    }
    count++;
  }
  
  return count;
}

/**
 * Identify and sync energy sensors.
 */
export async function syncEnergySensors(instanceId: string, client: HAClient) {
  const states = await client.getStates();
  
  // Find sensors with energy-related device classes
  const energyDeviceClasses = [
    "energy", "power", "gas", "water", "monetary", "battery"
  ];
  
  const energyStates = states.filter((s) => {
    const deviceClass = s.attributes.device_class as string | undefined;
    const stateClass = s.attributes.state_class as string | undefined;
    return deviceClass && energyDeviceClasses.includes(deviceClass) && stateClass;
  });
  
  let count = 0;
  for (const sensor of energyStates) {
    // First, ensure the entity exists in our entities table
    const entityRecord = await db
      .select({ id: schema.entities.id })
      .from(schema.entities)
      .where(
        and(
          eq(schema.entities.instanceId, instanceId),
          eq(schema.entities.entityId, sensor.entity_id)
        )
      )
      .limit(1);
    
    if (!entityRecord[0]) continue;
    
    const deviceClass = sensor.attributes.device_class as string;
    let sensorType: "consumption" | "production" | "battery" | "cost" | "gas" | "water";
    
    switch (deviceClass) {
      case "energy":
      case "power":
        sensorType = "consumption"; // Could be refined based on naming
        break;
      case "battery":
        sensorType = "battery";
        break;
      case "monetary":
        sensorType = "cost";
        break;
      case "gas":
        sensorType = "gas";
        break;
      case "water":
        sensorType = "water";
        break;
      default:
        sensorType = "consumption";
    }
    
    const existing = await db
      .select({ id: schema.energySensors.id })
      .from(schema.energySensors)
      .where(
        and(
          eq(schema.energySensors.instanceId, instanceId),
          eq(schema.energySensors.entityDbId, entityRecord[0].id)
        )
      )
      .limit(1);
    
    const data = {
      sensorType,
      unitOfMeasurement: (sensor.attributes.unit_of_measurement as string) ?? null,
      deviceClass: deviceClass,
      stateClass: (sensor.attributes.state_class as string) ?? null,
    };
    
    if (existing[0]) {
      await db
        .update(schema.energySensors)
        .set(data)
        .where(eq(schema.energySensors.id, existing[0].id));
    } else {
      await db.insert(schema.energySensors).values({
        instanceId,
        entityDbId: entityRecord[0].id,
        ...data,
      });
    }
    count++;
  }
  
  return count;
}

/**
 * Extended full sync: includes areas, devices, scenes, scripts, and energy sensors.
 */
export async function extendedFullSync(instanceId: string, client: HAClient) {
  const entityCount = await syncEntities(instanceId, client);
  const automationCount = await syncAutomations(instanceId, client);
  const areaCount = await syncAreas(instanceId, client);
  const deviceCount = await syncDevices(instanceId, client);
  const sceneCount = await syncScenes(instanceId, client);
  const scriptCount = await syncScripts(instanceId, client);
  const energySensorCount = await syncEnergySensors(instanceId, client);
  const statsCount = await computeDailyStats(instanceId, client);
  const baselineCount = await computeBaselines(instanceId);

  // Update last sync time
  await db
    .update(schema.haInstances)
    .set({ lastSyncAt: new Date(), status: "connected" })
    .where(eq(schema.haInstances.id, instanceId));

  return { 
    entityCount, 
    automationCount, 
    areaCount,
    deviceCount,
    sceneCount,
    scriptCount,
    energySensorCount,
    statsCount,
    baselineCount,
  };
}
