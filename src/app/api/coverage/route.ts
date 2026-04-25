import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

// Define what sensor/actuator types are expected per room type
const ROOM_COVERAGE_MODEL: Record<string, { sensors: string[]; actuators: string[] }> = {
  bedroom: {
    sensors: ["binary_sensor.motion", "sensor.temperature", "sensor.humidity", "binary_sensor.window", "sensor.light"],
    actuators: ["light", "climate", "cover"],
  },
  bathroom: {
    sensors: ["binary_sensor.motion", "sensor.temperature", "sensor.humidity"],
    actuators: ["light", "fan", "climate"],
  },
  kitchen: {
    sensors: ["binary_sensor.motion", "sensor.temperature", "sensor.humidity", "binary_sensor.smoke"],
    actuators: ["light", "switch"],
  },
  living_room: {
    sensors: ["binary_sensor.motion", "sensor.temperature", "sensor.light", "binary_sensor.window"],
    actuators: ["light", "climate", "cover", "media_player"],
  },
  office: {
    sensors: ["binary_sensor.motion", "sensor.temperature", "sensor.light"],
    actuators: ["light", "climate"],
  },
  garage: {
    sensors: ["binary_sensor.door", "binary_sensor.motion", "sensor.temperature"],
    actuators: ["light", "cover", "lock"],
  },
  hallway: {
    sensors: ["binary_sensor.motion", "sensor.light"],
    actuators: ["light"],
  },
  entrance: {
    sensors: ["binary_sensor.door", "binary_sensor.motion", "lock"],
    actuators: ["light", "lock"],
  },
  outdoor: {
    sensors: ["sensor.temperature", "sensor.humidity", "binary_sensor.motion"],
    actuators: ["light", "switch"],
  },
  default: {
    sensors: ["binary_sensor.motion", "sensor.temperature"],
    actuators: ["light"],
  },
};

function classifyRoom(areaName: string): string {
  const lower = areaName.toLowerCase();
  for (const roomType of Object.keys(ROOM_COVERAGE_MODEL)) {
    if (roomType === "default") continue;
    if (lower.includes(roomType.replace("_", " ")) || lower.includes(roomType.replace("_", ""))) {
      return roomType;
    }
  }
  // Common aliases
  if (lower.includes("bed")) return "bedroom";
  if (lower.includes("bath") || lower.includes("shower") || lower.includes("toilet")) return "bathroom";
  if (lower.includes("kitchen") || lower.includes("cook")) return "kitchen";
  if (lower.includes("living") || lower.includes("lounge") || lower.includes("family") || lower.includes("den")) return "living_room";
  if (lower.includes("office") || lower.includes("study") || lower.includes("desk")) return "office";
  if (lower.includes("garage") || lower.includes("carport")) return "garage";
  if (lower.includes("hall") || lower.includes("corridor") || lower.includes("stair")) return "hallway";
  if (lower.includes("entry") || lower.includes("front") || lower.includes("door") || lower.includes("porch") || lower.includes("foyer")) return "entrance";
  if (lower.includes("yard") || lower.includes("garden") || lower.includes("patio") || lower.includes("deck") || lower.includes("outdoor") || lower.includes("balcon")) return "outdoor";
  return "default";
}

function matchesCoverageType(entityDomain: string, entityId: string, coverageType: string): boolean {
  // coverageType can be "binary_sensor.motion", "sensor.temperature", "light", etc.
  if (coverageType.includes(".")) {
    const [domain, deviceClass] = coverageType.split(".");
    if (entityDomain !== domain) return false;
    // Check device class in entity_id as a heuristic
    return entityId.includes(deviceClass) || entityId.includes(deviceClass.replace("_", ""));
  }
  return entityDomain === coverageType;
}

/**
 * GET /api/coverage — smart home coverage analysis
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  // Verify ownership
  const [instance] = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Get areas
  const areasData = await db
    .select()
    .from(schema.areas)
    .where(eq(schema.areas.instanceId, instanceId));

  // Get all entities with their area assignments
  const entitiesData = await db
    .select({
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
      areaId: schema.entities.areaId,
      lastState: schema.entities.lastState,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  // Get automations for unlockable automation analysis
  const automationsData = await db
    .select({
      alias: schema.automations.alias,
      triggerConfig: schema.automations.triggerConfig,
      actionConfig: schema.automations.actionConfig,
      enabled: schema.automations.enabled,
    })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  // Build per-area entity map
  const entityByArea = new Map<string, typeof entitiesData>();
  const unassigned: typeof entitiesData = [];

  for (const entity of entitiesData) {
    if (entity.areaId) {
      const list = entityByArea.get(entity.areaId) || [];
      list.push(entity);
      entityByArea.set(entity.areaId, list);
    } else {
      unassigned.push(entity);
    }
  }

  // Build coverage map for each area
  const areaCoverage = areasData.map((area) => {
    const areaEntities = entityByArea.get(area.haAreaId) || [];
    const roomType = classifyRoom(area.name);
    const model = ROOM_COVERAGE_MODEL[roomType] || ROOM_COVERAGE_MODEL.default;

    // Check which expected sensor types are present
    const sensorCoverage = model.sensors.map((sensorType) => {
      const matching = areaEntities.filter((e) =>
        matchesCoverageType(e.domain, e.entityId, sensorType)
      );
      return {
        type: sensorType,
        present: matching.length > 0,
        entities: matching.map((e) => ({ entityId: e.entityId, friendlyName: e.friendlyName })),
        count: matching.length,
      };
    });

    const actuatorCoverage = model.actuators.map((actuatorType) => {
      const matching = areaEntities.filter((e) =>
        matchesCoverageType(e.domain, e.entityId, actuatorType)
      );
      return {
        type: actuatorType,
        present: matching.length > 0,
        entities: matching.map((e) => ({ entityId: e.entityId, friendlyName: e.friendlyName })),
        count: matching.length,
      };
    });

    const sensorScore = model.sensors.length > 0
      ? Math.round((sensorCoverage.filter((s) => s.present).length / model.sensors.length) * 100)
      : 100;
    const actuatorScore = model.actuators.length > 0
      ? Math.round((actuatorCoverage.filter((a) => a.present).length / model.actuators.length) * 100)
      : 100;
    const overallScore = Math.round((sensorScore + actuatorScore) / 2);

    const gaps = [
      ...sensorCoverage.filter((s) => !s.present).map((s) => ({
        type: "sensor" as const,
        missing: s.type,
        impact: `Missing ${s.type.split(".").pop()} detection in ${area.name}`,
      })),
      ...actuatorCoverage.filter((a) => !a.present).map((a) => ({
        type: "actuator" as const,
        missing: a.type,
        impact: `No ${a.type} control in ${area.name}`,
      })),
    ];

    return {
      area: { id: area.id, haAreaId: area.haAreaId, name: area.name, floorId: area.floorId, icon: area.icon },
      roomType,
      entityCount: areaEntities.length,
      sensorCoverage,
      actuatorCoverage,
      sensorScore,
      actuatorScore,
      overallScore,
      gaps,
    };
  });

  // Domain summary across all entities
  const domainCounts = new Map<string, number>();
  for (const e of entitiesData) {
    domainCounts.set(e.domain, (domainCounts.get(e.domain) || 0) + 1);
  }

  // Overall scores
  const totalAreas = areaCoverage.length;
  const avgScore = totalAreas > 0
    ? Math.round(areaCoverage.reduce((sum, a) => sum + a.overallScore, 0) / totalAreas)
    : 0;
  const totalGaps = areaCoverage.reduce((sum, a) => sum + a.gaps.length, 0);

  return NextResponse.json({
    areas: areaCoverage,
    summary: {
      totalAreas,
      totalEntities: entitiesData.length,
      unassignedEntities: unassigned.length,
      averageCoverageScore: avgScore,
      totalGaps,
      totalAutomations: automationsData.length,
      domainBreakdown: Object.fromEntries(domainCounts),
    },
    unassignedEntities: unassigned.slice(0, 20).map((e) => ({
      entityId: e.entityId,
      domain: e.domain,
      friendlyName: e.friendlyName,
    })),
  });
}
