import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAnthropicApiKey } from "@/lib/app-config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/simulator — "What If" scenario analysis
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { instanceId, scenario } = await request.json();

  if (!instanceId || !scenario) {
    return NextResponse.json({ error: "instanceId and scenario are required" }, { status: 400 });
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

  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
  }

  // Gather current setup data
  const entities = await db
    .select({
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
      areaId: schema.entities.areaId,
      lastState: schema.entities.lastState,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  const automations = await db
    .select({
      alias: schema.automations.alias,
      haAutomationId: schema.automations.haAutomationId,
      triggerConfig: schema.automations.triggerConfig,
      conditionConfig: schema.automations.conditionConfig,
      actionConfig: schema.automations.actionConfig,
      enabled: schema.automations.enabled,
    })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  const areas = await db
    .select({ haAreaId: schema.areas.haAreaId, name: schema.areas.name })
    .from(schema.areas)
    .where(eq(schema.areas.instanceId, instanceId));

  const systemPrompt = `You are a Home Assistant system analyst. The user wants to understand what would happen in a hypothetical scenario. Analyze their current setup and provide a detailed impact assessment.

Return a JSON object:
{
  "scenario": "Restated scenario in clear terms",
  "impact": {
    "automationsAffected": [
      {
        "name": "Automation name",
        "effect": "still_works" | "breaks" | "degraded" | "improved",
        "explanation": "What changes for this automation"
      }
    ],
    "entitiesAffected": [
      {
        "entityId": "entity_id",
        "effect": "unavailable" | "changed_behavior" | "new_capability" | "removed",
        "explanation": "Impact description"
      }
    ],
    "newOpportunities": [
      {
        "title": "What becomes possible",
        "description": "Detailed explanation",
        "automationYaml": "Optional: suggested automation YAML"
      }
    ]
  },
  "riskLevel": "low" | "medium" | "high",
  "summary": "3-5 sentence overall impact assessment",
  "recommendations": ["List of recommended actions before/after making this change"]
}

Be specific and reference actual entities and automations from the provided data.
CRITICAL: Only reference entity_ids that exist in the data. For hypothetical new devices, describe them but don't reference non-existent entity_ids in YAML.
Return valid JSON only, no markdown fences.`;

  const userPrompt = `## Scenario
"${scenario}"

## Current Entities (${entities.length} total)
${entities.map((e) => `- ${e.entityId} (${e.domain})${e.friendlyName ? ` "${e.friendlyName}"` : ""}${e.areaId ? ` [area: ${e.areaId}]` : ""} state=${e.lastState || "unknown"}`).join("\n")}

## Current Automations (${automations.length} total)
${automations.map((a) => {
  const triggers = JSON.stringify(a.triggerConfig);
  const actions = JSON.stringify(a.actionConfig);
  return `- ${a.alias || a.haAutomationId} [${a.enabled ? "on" : "off"}]: triggers=${triggers.slice(0, 100)}, actions=${actions.slice(0, 100)}`;
}).join("\n")}

## Areas
${areas.map((a) => `- ${a.haAreaId}: ${a.name}`).join("\n") || "No areas configured"}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const result = JSON.parse(text);

    return NextResponse.json({
      ...result,
      tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    });
  } catch (error) {
    console.error("[simulator] Error:", error);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
