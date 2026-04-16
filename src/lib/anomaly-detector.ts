import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export interface AnomalyDetectionConfig {
  zScoreThreshold: number; // Default: 2.5 (2.5 standard deviations)
  minDataPoints: number; // Minimum baseline data points required
  severityThresholds: {
    warning: number; // Z-score for warning (default: 2.5)
    critical: number; // Z-score for critical (default: 3.5)
  };
}

const DEFAULT_CONFIG: AnomalyDetectionConfig = {
  zScoreThreshold: 2.5,
  minDataPoints: 7,
  severityThresholds: {
    warning: 2.5,
    critical: 3.5,
  },
};

export interface DetectedAnomaly {
  entityId: string;
  entityDbId: string;
  friendlyName: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
  detectedValue: number;
  expectedValue: number;
  expectedRange: string;
  deviationScore: number;
  metric: "state_changes" | "active_time";
}

/**
 * Real-time anomaly detection service.
 * Compares current entity behavior against learned baselines.
 */
export class AnomalyDetector {
  private config: AnomalyDetectionConfig;

  constructor(config: Partial<AnomalyDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect anomalies for an entity based on today's stats vs baseline.
   */
  async detectForEntity(
    entityDbId: string,
    todayStats: {
      stateChanges: number;
      activeTime: number;
    }
  ): Promise<DetectedAnomaly[]> {
    const anomalies: DetectedAnomaly[] = [];

    // Get entity info
    const entity = await db
      .select({
        id: schema.entities.id,
        entityId: schema.entities.entityId,
        friendlyName: schema.entities.friendlyName,
        instanceId: schema.entities.instanceId,
      })
      .from(schema.entities)
      .where(eq(schema.entities.id, entityDbId))
      .limit(1);

    if (!entity[0]) return anomalies;

    // Get baseline for today's day of week
    const dayOfWeek = new Date().getDay();
    const baseline = await db
      .select()
      .from(schema.entityBaselines)
      .where(
        and(
          eq(schema.entityBaselines.entityId, entityDbId),
          eq(schema.entityBaselines.dayOfWeek, dayOfWeek)
        )
      )
      .limit(1);

    if (!baseline[0]) return anomalies;

    const b = baseline[0];
    const avgStateChanges = Number(b.avgStateChanges) || 0;
    const stdDevStateChanges = Number(b.stdDevStateChanges) || 1;
    const avgActiveTime = Number(b.avgActiveTime) || 0;

    // Check state changes anomaly
    if (stdDevStateChanges > 0 && avgStateChanges > 0) {
      const zScore = (todayStats.stateChanges - avgStateChanges) / stdDevStateChanges;
      const absZScore = Math.abs(zScore);

      if (absZScore >= this.config.zScoreThreshold) {
        const severity = this.getSeverity(absZScore);
        const direction = zScore > 0 ? "higher" : "lower";
        const minExpected = Math.max(0, avgStateChanges - 2 * stdDevStateChanges);
        const maxExpected = avgStateChanges + 2 * stdDevStateChanges;

        anomalies.push({
          entityId: entity[0].entityId,
          entityDbId: entity[0].id,
          friendlyName: entity[0].friendlyName ?? entity[0].entityId,
          severity,
          title: `Unusual activity: ${entity[0].friendlyName || entity[0].entityId}`,
          description: `State changes are ${Math.abs(Math.round((todayStats.stateChanges - avgStateChanges) / avgStateChanges * 100))}% ${direction} than usual. Expected ${Math.round(avgStateChanges)} changes, observed ${todayStats.stateChanges}.`,
          detectedValue: todayStats.stateChanges,
          expectedValue: avgStateChanges,
          expectedRange: `${Math.round(minExpected)}-${Math.round(maxExpected)}`,
          deviationScore: absZScore,
          metric: "state_changes",
        });
      }
    }

    // Check active time anomaly (for binary state entities)
    if (avgActiveTime > 0 && todayStats.activeTime > 0) {
      const activeTimeRatio = todayStats.activeTime / avgActiveTime;
      // Simple threshold-based detection for active time
      if (activeTimeRatio > 2 || activeTimeRatio < 0.5) {
        const severity: "info" | "warning" | "critical" = activeTimeRatio > 3 || activeTimeRatio < 0.25 ? "warning" : "info";
        const direction = activeTimeRatio > 1 ? "longer" : "shorter";
        
        anomalies.push({
          entityId: entity[0].entityId,
          entityDbId: entity[0].id,
          friendlyName: entity[0].friendlyName ?? entity[0].entityId,
          severity,
          title: `Unusual duration: ${entity[0].friendlyName || entity[0].entityId}`,
          description: `Active time is ${Math.round(Math.abs(activeTimeRatio - 1) * 100)}% ${direction} than usual.`,
          detectedValue: todayStats.activeTime,
          expectedValue: avgActiveTime,
          expectedRange: `${Math.round(avgActiveTime * 0.5)}-${Math.round(avgActiveTime * 1.5)}s`,
          deviationScore: Math.abs(activeTimeRatio - 1) * 2,
          metric: "active_time",
        });
      }
    }

    return anomalies;
  }

  /**
   * Run anomaly detection for all tracked entities in an instance.
   */
  async detectForInstance(instanceId: string): Promise<DetectedAnomaly[]> {
    const allAnomalies: DetectedAnomaly[] = [];
    const today = new Date().toISOString().split("T")[0];

    // Get all tracked entities with today's stats
    const entitiesWithStats = await db
      .select({
        entityId: schema.entities.id,
        entityIdString: schema.entities.entityId,
        friendlyName: schema.entities.friendlyName,
        stateChanges: schema.entityDailyStats.stateChanges,
        activeTime: schema.entityDailyStats.activeTime,
      })
      .from(schema.entities)
      .innerJoin(
        schema.entityDailyStats,
        eq(schema.entities.id, schema.entityDailyStats.entityId)
      )
      .where(
        and(
          eq(schema.entities.instanceId, instanceId),
          eq(schema.entities.isTracked, true),
          eq(schema.entityDailyStats.date, today)
        )
      );

    for (const entity of entitiesWithStats) {
      const anomalies = await this.detectForEntity(entity.entityId, {
        stateChanges: entity.stateChanges ?? 0,
        activeTime: entity.activeTime ?? 0,
      });
      allAnomalies.push(...anomalies);
    }

    return allAnomalies;
  }

  /**
   * Store detected anomalies in the database.
   */
  async storeAnomalies(instanceId: string, anomalies: DetectedAnomaly[]): Promise<void> {
    for (const anomaly of anomalies) {
      // Check if similar anomaly already exists (within last 24h)
      const existing = await db
        .select({ id: schema.anomalyAlerts.id })
        .from(schema.anomalyAlerts)
        .where(
          and(
            eq(schema.anomalyAlerts.instanceId, instanceId),
            eq(schema.anomalyAlerts.entityDbId, anomaly.entityDbId),
            eq(schema.anomalyAlerts.status, "active"),
            gte(schema.anomalyAlerts.detectedAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
          )
        )
        .limit(1);

      if (existing.length > 0) {
        // Update existing alert
        await db
          .update(schema.anomalyAlerts)
          .set({
            detectedValue: String(anomaly.detectedValue),
            expectedRange: anomaly.expectedRange,
            deviationScore: String(anomaly.deviationScore),
            severity: anomaly.severity,
            description: anomaly.description,
          })
          .where(eq(schema.anomalyAlerts.id, existing[0].id));
      } else {
        // Create new alert
        await db.insert(schema.anomalyAlerts).values({
          instanceId,
          entityDbId: anomaly.entityDbId,
          severity: anomaly.severity,
          status: "active",
          title: anomaly.title,
          description: anomaly.description,
          detectedValue: String(anomaly.detectedValue),
          expectedRange: anomaly.expectedRange,
          deviationScore: String(anomaly.deviationScore),
          metadata: {
            metric: anomaly.metric,
            expectedValue: anomaly.expectedValue,
          },
        });
      }
    }
  }

  /**
   * Get active anomaly alerts for an instance.
   */
  async getActiveAlerts(instanceId: string, limit = 20) {
    return db
      .select({
        id: schema.anomalyAlerts.id,
        severity: schema.anomalyAlerts.severity,
        status: schema.anomalyAlerts.status,
        title: schema.anomalyAlerts.title,
        description: schema.anomalyAlerts.description,
        detectedValue: schema.anomalyAlerts.detectedValue,
        expectedRange: schema.anomalyAlerts.expectedRange,
        deviationScore: schema.anomalyAlerts.deviationScore,
        detectedAt: schema.anomalyAlerts.detectedAt,
        entityId: schema.entities.entityId,
        friendlyName: schema.entities.friendlyName,
      })
      .from(schema.anomalyAlerts)
      .leftJoin(schema.entities, eq(schema.anomalyAlerts.entityDbId, schema.entities.id))
      .where(
        and(
          eq(schema.anomalyAlerts.instanceId, instanceId),
          eq(schema.anomalyAlerts.status, "active")
        )
      )
      .orderBy(desc(schema.anomalyAlerts.detectedAt))
      .limit(limit);
  }

  /**
   * Acknowledge an anomaly alert.
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    await db
      .update(schema.anomalyAlerts)
      .set({
        status: "acknowledged",
        acknowledgedAt: new Date(),
      })
      .where(eq(schema.anomalyAlerts.id, alertId));
  }

  /**
   * Dismiss an anomaly alert.
   */
  async dismissAlert(alertId: string): Promise<void> {
    await db
      .update(schema.anomalyAlerts)
      .set({
        status: "dismissed",
      })
      .where(eq(schema.anomalyAlerts.id, alertId));
  }

  /**
   * Resolve an anomaly alert.
   */
  async resolveAlert(alertId: string): Promise<void> {
    await db
      .update(schema.anomalyAlerts)
      .set({
        status: "resolved",
        resolvedAt: new Date(),
      })
      .where(eq(schema.anomalyAlerts.id, alertId));
  }

  private getSeverity(zScore: number): "info" | "warning" | "critical" {
    if (zScore >= this.config.severityThresholds.critical) return "critical";
    if (zScore >= this.config.severityThresholds.warning) return "warning";
    return "info";
  }
}

/**
 * Create a default anomaly detector instance.
 */
export function createAnomalyDetector(config?: Partial<AnomalyDetectionConfig>) {
  return new AnomalyDetector(config);
}
