import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { HAStateChangedEvent } from "./ha-websocket";

interface EntityState {
  currentState: string;
  stateStartedAt: number; // epoch ms
  attributes: Record<string, unknown>;
  lastChangedAt: Date;
  dirty: boolean; // needs DB flush
}

interface DailyCounters {
  date: string; // YYYY-MM-DD
  stateChanges: number;
  activeTime: number; // seconds
  hourlyActivity: Record<string, number>; // hour 0-23 → count
  stateDistribution: Record<string, number>; // state → seconds
}

const ACTIVE_STATES = new Set(["on", "open", "playing", "home", "active"]);
const ENTITY_FLUSH_INTERVAL = 30_000; // 30 seconds
const HOURLY_FLUSH_INTERVAL = 300_000; // 5 minutes (flush hourly counters frequently)

/**
 * Aggregates real-time state_changed events in memory and periodically
 * flushes to the database. Maintains entity state, hourly activity counters,
 * and state distribution for daily stats.
 */
export class StateAggregator {
  private instanceId: string;
  private entityStates = new Map<string, EntityState>();
  private dailyCounters = new Map<string, DailyCounters>(); // keyed by entity DB id
  private entityIdMap = new Map<string, string>(); // entityId (HA) → DB id
  private entityFlushTimer: ReturnType<typeof setInterval> | null = null;
  private hourlyFlushTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /** Load current entity states from DB to seed the in-memory map. */
  async initialize(): Promise<void> {
    const entities = await db
      .select({
        id: schema.entities.id,
        entityId: schema.entities.entityId,
        lastState: schema.entities.lastState,
        lastChangedAt: schema.entities.lastChangedAt,
        attributes: schema.entities.attributes,
        isTracked: schema.entities.isTracked,
      })
      .from(schema.entities)
      .where(eq(schema.entities.instanceId, this.instanceId));

    for (const entity of entities) {
      this.entityIdMap.set(entity.entityId, entity.id);

      this.entityStates.set(entity.entityId, {
        currentState: entity.lastState || "unknown",
        stateStartedAt: entity.lastChangedAt?.getTime() ?? Date.now(),
        attributes: (entity.attributes as Record<string, unknown>) || {},
        lastChangedAt: entity.lastChangedAt || new Date(),
        dirty: false,
      });

      // Initialize daily counters for tracked entities
      if (entity.isTracked) {
        this.initDailyCounters(entity.id);
      }
    }

    // Start flush timers
    this.entityFlushTimer = setInterval(
      () => this.flushEntities(),
      ENTITY_FLUSH_INTERVAL
    );
    this.hourlyFlushTimer = setInterval(
      () => this.flushDailyStats(),
      HOURLY_FLUSH_INTERVAL
    );
    this.running = true;

    console.log(
      `[aggregator] Initialized with ${entities.length} entities for instance ${this.instanceId}`
    );
  }

  /** Process a state_changed event from the WebSocket. */
  onStateChanged(event: HAStateChangedEvent): void {
    if (!event.new_state) return;

    const entityId = event.entity_id;
    const now = Date.now();
    const timestamp = new Date(event.new_state.last_changed);

    const existing = this.entityStates.get(entityId);

    // Calculate duration in previous state
    if (existing && event.old_state) {
      const duration = Math.max(
        0,
        Math.floor((timestamp.getTime() - existing.stateStartedAt) / 1000)
      );
      const dbId = this.entityIdMap.get(entityId);
      if (dbId) {
        const counters = this.dailyCounters.get(dbId);
        if (counters) {
          // Check for day rollover
          const currentDate = this.todayStr();
          if (counters.date !== currentDate) {
            // Finalize previous day, start new counters
            this.initDailyCounters(dbId);
          }

          const c = this.dailyCounters.get(dbId)!;
          c.stateChanges++;

          // Hourly activity
          const hour = timestamp.getHours();
          c.hourlyActivity[String(hour)] =
            (c.hourlyActivity[String(hour)] || 0) + 1;

          // State distribution — add duration spent in old state
          if (event.old_state) {
            c.stateDistribution[event.old_state.state] =
              (c.stateDistribution[event.old_state.state] || 0) + duration;
          }

          // Active time
          if (event.old_state && ACTIVE_STATES.has(event.old_state.state)) {
            c.activeTime += duration;
          }
        }
      }
    }

    // Update in-memory state
    this.entityStates.set(entityId, {
      currentState: event.new_state.state,
      stateStartedAt: timestamp.getTime(),
      attributes: event.new_state.attributes,
      lastChangedAt: timestamp,
      dirty: true,
    });

    // If this is a new entity we haven't seen, we don't have a DB id yet.
    // It will be picked up on the next reconciliation sync.
  }

  /** Flush dirty entity states to the DB. */
  async flushEntities(): Promise<void> {
    const updates: Array<{
      dbId: string;
      lastState: string;
      lastChangedAt: Date;
      attributes: Record<string, unknown>;
    }> = [];

    for (const [entityId, state] of this.entityStates) {
      if (!state.dirty) continue;
      const dbId = this.entityIdMap.get(entityId);
      if (!dbId) continue;

      updates.push({
        dbId,
        lastState: state.currentState,
        lastChangedAt: state.lastChangedAt,
        attributes: state.attributes,
      });
      state.dirty = false;
    }

    if (updates.length === 0) return;

    try {
      // Batch update — individual queries since Drizzle doesn't support multi-row update easily
      for (const u of updates) {
        await db
          .update(schema.entities)
          .set({
            lastState: u.lastState,
            lastChangedAt: u.lastChangedAt,
            attributes: u.attributes,
          })
          .where(eq(schema.entities.id, u.dbId));
      }
      console.log(`[aggregator] Flushed ${updates.length} entity states`);
    } catch (err) {
      console.error("[aggregator] Entity flush failed:", err);
    }
  }

  /** Flush daily stats counters to the DB. */
  async flushDailyStats(): Promise<void> {
    const currentDate = this.todayStr();
    let flushed = 0;

    for (const [dbId, counters] of this.dailyCounters) {
      if (counters.stateChanges === 0 && counters.activeTime === 0) continue;

      try {
        // Check if a row exists for this entity+date
        const existing = await db
          .select({ id: schema.entityDailyStats.id })
          .from(schema.entityDailyStats)
          .where(
            and(
              eq(schema.entityDailyStats.entityId, dbId),
              eq(schema.entityDailyStats.date, counters.date)
            )
          )
          .limit(1);

        if (existing[0]) {
          // Merge with existing row — add our counters to existing values
          const existingRow = await db
            .select()
            .from(schema.entityDailyStats)
            .where(eq(schema.entityDailyStats.id, existing[0].id))
            .limit(1);

          if (existingRow[0]) {
            const existingHourly =
              (existingRow[0].hourlyActivity as Record<string, number>) || {};
            const existingDist =
              (existingRow[0].stateDistribution as Record<string, number>) ||
              {};

            // Merge hourly activity
            const mergedHourly = { ...existingHourly };
            for (const [hour, count] of Object.entries(
              counters.hourlyActivity
            )) {
              mergedHourly[hour] = (mergedHourly[hour] || 0) + count;
            }

            // Merge state distribution
            const mergedDist = { ...existingDist };
            for (const [state, seconds] of Object.entries(
              counters.stateDistribution
            )) {
              mergedDist[state] = (mergedDist[state] || 0) + seconds;
            }

            await db
              .update(schema.entityDailyStats)
              .set({
                stateChanges:
                  existingRow[0].stateChanges + counters.stateChanges,
                activeTime: existingRow[0].activeTime + counters.activeTime,
                hourlyActivity: mergedHourly,
                stateDistribution: mergedDist,
              })
              .where(eq(schema.entityDailyStats.id, existing[0].id));
          }
        } else {
          // Insert new row
          await db.insert(schema.entityDailyStats).values({
            entityId: dbId,
            date: counters.date,
            stateChanges: counters.stateChanges,
            activeTime: counters.activeTime,
            hourlyActivity: counters.hourlyActivity,
            stateDistribution: counters.stateDistribution,
          });
        }

        flushed++;

        // Reset counters (keep the same date until rollover)
        counters.stateChanges = 0;
        counters.activeTime = 0;
        counters.hourlyActivity = {};
        counters.stateDistribution = {};
      } catch (err) {
        console.error(
          `[aggregator] Daily stats flush failed for entity ${dbId}:`,
          err
        );
      }
    }

    if (flushed > 0) {
      console.log(
        `[aggregator] Flushed daily stats for ${flushed} entities (${currentDate})`
      );
    }
  }

  /** Gracefully flush all pending data and stop timers. */
  async shutdown(): Promise<void> {
    this.running = false;
    if (this.entityFlushTimer) {
      clearInterval(this.entityFlushTimer);
      this.entityFlushTimer = null;
    }
    if (this.hourlyFlushTimer) {
      clearInterval(this.hourlyFlushTimer);
      this.hourlyFlushTimer = null;
    }

    // Final flush
    await this.flushEntities();
    await this.flushDailyStats();
    console.log("[aggregator] Shutdown complete — all data flushed");
  }

  /** Whether the aggregator is actively processing events. */
  isRunning(): boolean {
    return this.running;
  }

  /** Refresh the entity ID map (call after syncEntities adds new entities). */
  async refreshEntityMap(): Promise<void> {
    const entities = await db
      .select({
        id: schema.entities.id,
        entityId: schema.entities.entityId,
        isTracked: schema.entities.isTracked,
      })
      .from(schema.entities)
      .where(eq(schema.entities.instanceId, this.instanceId));

    for (const entity of entities) {
      this.entityIdMap.set(entity.entityId, entity.id);
      if (entity.isTracked && !this.dailyCounters.has(entity.id)) {
        this.initDailyCounters(entity.id);
      }
    }
  }

  private initDailyCounters(dbId: string): void {
    this.dailyCounters.set(dbId, {
      date: this.todayStr(),
      stateChanges: 0,
      activeTime: 0,
      hourlyActivity: {},
      stateDistribution: {},
    });
  }

  private todayStr(): string {
    return new Date().toISOString().split("T")[0];
  }
}
