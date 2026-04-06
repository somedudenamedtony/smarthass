import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

interface GraphNode {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation";
  label?: string;
}

/**
 * GET /api/entities/graph?instanceId=...
 * Build a graph of entity relationships from automations and AI correlation insights.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const instanceId = new URL(request.url).searchParams.get("instanceId");
  if (!instanceId) {
    return NextResponse.json(
      { error: "instanceId is required" },
      { status: 400 }
    );
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

  // Fetch all entities for this instance
  const entities = await db
    .select({
      id: schema.entities.id,
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
      areaId: schema.entities.areaId,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  const entityByHaId = new Map(entities.map((e) => [e.entityId, e]));
  const nodeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // 1. Extract relationships from automations
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
          nodeSet.add(srcNode.entityId);
          nodeSet.add(tgtNode.entityId);
          edges.push({
            source: srcNode.entityId,
            target: tgtNode.entityId,
            type: "automation",
            label: auto.alias ?? undefined,
          });
        }
      }
    }
  }

  // 2. Extract from correlation insights
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
    const entityIds = meta?.entities ?? [];
    // Create edges between all pairs
    for (let i = 0; i < entityIds.length; i++) {
      for (let j = i + 1; j < entityIds.length; j++) {
        const a = entityByHaId.get(entityIds[i]);
        const b = entityByHaId.get(entityIds[j]);
        if (a && b) {
          nodeSet.add(a.entityId);
          nodeSet.add(b.entityId);
          edges.push({
            source: a.entityId,
            target: b.entityId,
            type: "correlation",
            label: c.title,
          });
        }
      }
    }
  }

  // Build final nodes
  const nodes: GraphNode[] = entities
    .filter((e) => nodeSet.has(e.entityId))
    .map((e) => ({
      id: e.entityId,
      entityId: e.entityId,
      friendlyName: e.friendlyName,
      domain: e.domain,
      areaId: e.areaId,
    }));

  return NextResponse.json({ nodes, edges });
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
