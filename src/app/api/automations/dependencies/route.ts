import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAnthropicApiKey } from "@/lib/app-config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * GET /api/automations/dependencies — build automation dependency graph
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

  // Get all automations
  const automations = await db
    .select()
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  // Parse entity references from automation configs
  function extractEntityIds(config: unknown): string[] {
    if (!config) return [];
    const str = JSON.stringify(config);
    const matches = str.match(/(?:entity_id|entity)["']?\s*[:=]\s*["']([a-z_]+\.[a-z0-9_]+)/g) || [];
    const ids = new Set<string>();
    for (const match of matches) {
      const idMatch = match.match(/([a-z_]+\.[a-z0-9_]+)$/);
      if (idMatch) ids.add(idMatch[1]);
    }
    // Also find entity IDs in arrays
    const arrayMatches = str.match(/"([a-z_]+\.[a-z0-9_]+)"/g) || [];
    for (const match of arrayMatches) {
      const clean = match.replace(/"/g, "");
      if (/^[a-z_]+\.[a-z0-9_]+$/.test(clean) && !clean.startsWith("homeassistant.")) {
        ids.add(clean);
      }
    }
    return [...ids];
  }

  // Build nodes and edges
  const nodes: Array<{
    id: string;
    type: "automation" | "entity";
    label: string;
    metadata: Record<string, unknown>;
  }> = [];
  const edges: Array<{
    source: string;
    target: string;
    type: "trigger" | "condition" | "action";
  }> = [];

  const entitySet = new Set<string>();
  const automationEntityMap = new Map<string, { triggers: string[]; conditions: string[]; actions: string[] }>();

  for (const auto of automations) {
    const autoNodeId = `auto:${auto.id}`;
    nodes.push({
      id: autoNodeId,
      type: "automation",
      label: auto.alias || auto.haAutomationId,
      metadata: { enabled: auto.enabled, lastTriggered: auto.lastTriggered },
    });

    const triggerEntities = extractEntityIds(auto.triggerConfig);
    const conditionEntities = extractEntityIds(auto.conditionConfig);
    const actionEntities = extractEntityIds(auto.actionConfig);

    automationEntityMap.set(auto.id, {
      triggers: triggerEntities,
      conditions: conditionEntities,
      actions: actionEntities,
    });

    for (const entityId of triggerEntities) {
      entitySet.add(entityId);
      edges.push({ source: `entity:${entityId}`, target: autoNodeId, type: "trigger" });
    }
    for (const entityId of conditionEntities) {
      entitySet.add(entityId);
      edges.push({ source: `entity:${entityId}`, target: autoNodeId, type: "condition" });
    }
    for (const entityId of actionEntities) {
      entitySet.add(entityId);
      edges.push({ source: autoNodeId, target: `entity:${entityId}`, type: "action" });
    }
  }

  // Add entity nodes
  const entitiesData = await db
    .select({
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  const entityNameMap = new Map(entitiesData.map((e) => [e.entityId, e.friendlyName || e.entityId]));

  for (const entityId of entitySet) {
    nodes.push({
      id: `entity:${entityId}`,
      type: "entity",
      label: entityNameMap.get(entityId) || entityId,
      metadata: { domain: entityId.split(".")[0] },
    });
  }

  // Detect conflicts: entities acted on by multiple automations
  const entityActionMap = new Map<string, string[]>();
  for (const auto of automations) {
    const map = automationEntityMap.get(auto.id);
    if (!map) continue;
    for (const entityId of map.actions) {
      const list = entityActionMap.get(entityId) || [];
      list.push(auto.alias || auto.haAutomationId);
      entityActionMap.set(entityId, list);
    }
  }

  const conflicts = [...entityActionMap.entries()]
    .filter(([, autos]) => autos.length > 1)
    .map(([entityId, autos]) => ({
      entityId,
      automations: autos,
      description: `${entityNameMap.get(entityId) || entityId} is controlled by ${autos.length} automations: ${autos.join(", ")}`,
    }));

  // Detect chains: automation A acts on entity X, entity X triggers automation B
  const chains: Array<{ from: string; via: string; to: string; description: string }> = [];
  for (const auto of automations) {
    const map = automationEntityMap.get(auto.id);
    if (!map) continue;
    for (const actionEntity of map.actions) {
      // Find automations triggered by this entity
      for (const otherAuto of automations) {
        if (otherAuto.id === auto.id) continue;
        const otherMap = automationEntityMap.get(otherAuto.id);
        if (!otherMap) continue;
        if (otherMap.triggers.includes(actionEntity)) {
          chains.push({
            from: auto.alias || auto.haAutomationId,
            via: entityNameMap.get(actionEntity) || actionEntity,
            to: otherAuto.alias || otherAuto.haAutomationId,
            description: `"${auto.alias || auto.haAutomationId}" → ${actionEntity} → "${otherAuto.alias || otherAuto.haAutomationId}"`,
          });
        }
      }
    }
  }

  // Detect orphans: automations referencing entities that don't exist
  const knownEntityIds = new Set(entitiesData.map((e) => e.entityId));
  const orphanRefs: Array<{ automation: string; missingEntities: string[] }> = [];
  for (const auto of automations) {
    const map = automationEntityMap.get(auto.id);
    if (!map) continue;
    const allRefs = [...map.triggers, ...map.conditions, ...map.actions];
    const missing = [...new Set(allRefs.filter((e) => !knownEntityIds.has(e)))];
    if (missing.length > 0) {
      orphanRefs.push({
        automation: auto.alias || auto.haAutomationId,
        missingEntities: missing,
      });
    }
  }

  return NextResponse.json({
    graph: { nodes, edges },
    analysis: { conflicts, chains, orphanRefs },
    stats: {
      totalAutomations: automations.length,
      totalEntityRefs: entitySet.size,
      totalConflicts: conflicts.length,
      totalChains: chains.length,
      totalOrphanRefs: orphanRefs.length,
    },
  });
}

/**
 * POST /api/automations/dependencies — AI analysis of dependency graph
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId, graph, analysis } = await request.json();

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a Home Assistant automation architect. Analyze the automation dependency graph and provide insights about potential issues and optimization opportunities.

Return a JSON object:
{
  "insights": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "Short title",
      "description": "Detailed explanation",
      "affectedAutomations": ["automation names"],
      "suggestion": "How to fix"
    }
  ],
  "overallHealth": "good" | "fair" | "poor",
  "summary": "2-3 sentence overall assessment"
}

Look for: timing conflicts, race conditions, cascading chains that could loop, entities controlled by conflicting automations, orphaned entity references, optimization opportunities.
Return valid JSON only, no markdown fences.`;

  const userPrompt = `## Dependency Graph Analysis
### Conflicts (entities controlled by multiple automations)
${JSON.stringify(analysis.conflicts, null, 2)}

### Chains (automation cascades)
${JSON.stringify(analysis.chains, null, 2)}

### Orphan References (missing entities)
${JSON.stringify(analysis.orphanRefs, null, 2)}

### Graph Stats
${JSON.stringify(graph?.nodes?.length || 0)} nodes, ${JSON.stringify(graph?.edges?.length || 0)} edges`;

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 2048,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    return NextResponse.json(JSON.parse(cleaned));
  } catch (error) {
    console.error("[dependencies-ai] Error:", error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
