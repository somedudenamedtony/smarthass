import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

interface GraphNode {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
  deviceId: string | null;
  lastState: string | null;
  activity: number; // recent state changes — drives node size
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation" | "device" | "area";
  label?: string;
  weight?: number;
}

/**
 * GET /api/entities/graph?instanceId=...&domains=...&areas=...
 * Build a rich graph of entity relationships.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const instanceId = params.get("instanceId");
  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId is required" },
      { status: 400 }
    );
  }

  const domainFilter = params.get("domains")?.split(",").filter(Boolean) ?? [];
  const areaFilter = params.get("areas")?.split(",").filter(Boolean) ?? [];

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

  // Fetch all entities for this instance
  const allEntities = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      areaId: schema.entities.areaId,
      deviceId: schema.entities.deviceId,
      lastState: schema.entities.lastState,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  // Apply filters
  let entities = allEntities;
  if (domainFilter.length > 0) {
    entities = entities.filter((e) => domainFilter.includes(e.domain));
  }
  if (areaFilter.length > 0) {
    entities = entities.filter(
      (e) => e.areaId && areaFilter.includes(e.areaId)
    );
  }

  // Fetch recent activity (last 14 days of daily stats) for node sizing
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const entityIds = entities.map((e) => e.id);

  const activityRows =
    entityIds.length > 0
      ? await db
          .select({
            entityId: schema.entityDailyStats.entityId,
            totalChanges:
              sql<number>`COALESCE(SUM(${schema.entityDailyStats.stateChanges}), 0)`.as(
                "total_changes"
              ),
          })
          .from(schema.entityDailyStats)
          .where(
            and(
              sql`${schema.entityDailyStats.entityId} = ANY(${entityIds})`,
              gte(
                schema.entityDailyStats.date,
                fourteenDaysAgo.toISOString().slice(0, 10)
              )
            )
          )
          .groupBy(schema.entityDailyStats.entityId)
      : [];

  const activityMap = new Map(
    activityRows.map((r) => [r.entityId, Number(r.totalChanges)])
  );

  const entityByHaId = new Map(entities.map((e) => [e.entityId, e]));
  const entityByUuid = new Map(entities.map((e) => [e.id, e]));
  const edgeSet = new Set<string>(); // dedup key
  const edges: GraphEdge[] = [];

  function addEdge(edge: GraphEdge) {
    const key = `${edge.type}:${[edge.source, edge.target].sort().join("-")}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push(edge);
  }

  // 1. Automation trigger → action relationships
  const automations = await db
    .select({
      alias: schema.automations.alias,
      triggerConfig: schema.automations.triggerConfig,
      conditionConfig: schema.automations.conditionConfig,
      actionConfig: schema.automations.actionConfig,
    })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  for (const auto of automations) {
    const triggerEntities = extractEntityIds(auto.triggerConfig);
    const actionEntities = extractEntityIds(auto.actionConfig);
    const conditionEntities = extractEntityIds(auto.conditionConfig);

    const sources = [...triggerEntities, ...conditionEntities];
    const targets = actionEntities;

    for (const src of sources) {
      for (const tgt of targets) {
        if (src === tgt) continue;
        const srcNode = entityByHaId.get(src);
        const tgtNode = entityByHaId.get(tgt);
        if (srcNode && tgtNode) {
          addEdge({
            source: srcNode.entityId,
            target: tgtNode.entityId,
            type: "automation",
            label: auto.alias ?? undefined,
          });
        }
      }
    }
  }

  // 2. AI correlation insights
  const correlations = await db
    .select({
      metadata: schema.aiAnalyses.metadata,
      title: schema.aiAnalyses.title,
    })
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.instanceId, instanceId),
        eq(schema.aiAnalyses.type, "correlation")
      )
    );

  for (const c of correlations) {
    const meta = c.metadata as { entities?: string[] } | null;
    const entityIdsList = meta?.entities ?? [];
    for (let i = 0; i < entityIdsList.length; i++) {
      for (let j = i + 1; j < entityIdsList.length; j++) {
        const a = entityByHaId.get(entityIdsList[i]);
        const b = entityByHaId.get(entityIdsList[j]);
        if (a && b) {
          addEdge({
            source: a.entityId,
            target: b.entityId,
            type: "correlation",
            label: c.title,
          });
        }
      }
    }
  }

  // 3. Shared-device edges — entities on the same physical device
  const deviceGroups = new Map<string, typeof entities>();
  for (const e of entities) {
    if (!e.deviceId) continue;
    const group = deviceGroups.get(e.deviceId) ?? [];
    group.push(e);
    deviceGroups.set(e.deviceId, group);
  }
  for (const group of deviceGroups.values()) {
    if (group.length < 2 || group.length > 10) continue; // skip huge device groups
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        addEdge({
          source: group[i].entityId,
          target: group[j].entityId,
          type: "device",
          label: "same device",
        });
      }
    }
  }

  // 4. Same-area edges — connect active entities in the same room
  const areaGroups = new Map<string, typeof entities>();
  for (const e of entities) {
    if (!e.areaId) continue;
    const group = areaGroups.get(e.areaId) ?? [];
    group.push(e);
    areaGroups.set(e.areaId, group);
  }
  for (const [, group] of areaGroups) {
    // Only link entities that both have some activity, to keep noise down
    const active = group.filter(
      (e) => (activityMap.get(e.id) ?? 0) > 0
    );
    if (active.length < 2 || active.length > 15) continue;
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        addEdge({
          source: active[i].entityId,
          target: active[j].entityId,
          type: "area",
          label: active[i].areaId ?? undefined,
        });
      }
    }
  }

  // Build all unique areas and domains for filter options
  const allAreas = [
    ...new Set(allEntities.map((e) => e.areaId).filter(Boolean)),
  ] as string[];
  const allDomains = [
    ...new Set(allEntities.map((e) => e.domain).filter(Boolean)),
  ].sort();

  // Include ALL (filtered) entities as nodes — not just connected ones
  const nodes: GraphNode[] = entities.map((e) => ({
    id: e.entityId,
    entityId: e.entityId,
    friendlyName: e.friendlyName,
    domain: e.domain,
    areaId: e.areaId,
    deviceId: e.deviceId,
    lastState: e.lastState,
    activity: activityMap.get(e.id) ?? 0,
  }));

  return NextResponse.json({
    nodes,
    edges,
    areas: allAreas,
    domains: allDomains,
  });
}

/**
 * Recursively extract entity_id values from HA automation config JSON.
 */
function extractEntityIds(config: unknown): string[] {
  const ids: string[] = [];
  if (!config) return ids;

  function walk(obj: unknown) {
    if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (obj && typeof obj === "object") {
      for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        if (key === "entity_id" && typeof val === "string") {
          ids.push(val);
        } else if (key === "entity_id" && Array.isArray(val)) {
          val.forEach((v) => {
            if (typeof v === "string") ids.push(v);
          });
        } else {
          walk(val);
        }
      }
    }
  }

  walk(config);
  return [...new Set(ids)];
}
