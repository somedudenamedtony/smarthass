import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAnthropicApiKey } from "@/lib/app-config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * POST /api/automations/generate — natural language to automation YAML
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { instanceId, intent, selectedEntities, conditions } = body;

  if (!instanceId || !intent) {
    return NextResponse.json({ error: "instanceId and intent are required" }, { status: 400 });
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

  // Get entities for this instance
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

  // Get existing automations for context
  const existingAutomations = await db
    .select({ alias: schema.automations.alias, haAutomationId: schema.automations.haAutomationId })
    .from(schema.automations)
    .where(eq(schema.automations.instanceId, instanceId));

  // Get areas for context
  const areas = await db
    .select({ haAreaId: schema.areas.haAreaId, name: schema.areas.name })
    .from(schema.areas)
    .where(eq(schema.areas.instanceId, instanceId));

  const systemPrompt = `You are a Home Assistant automation builder. Given a user's natural language intent, generate a complete, valid Home Assistant automation configuration.

Return a JSON object with:
{
  "name": "Human-readable automation name",
  "description": "What this automation does",
  "automationYaml": "Complete HA automation YAML (alias, trigger, condition, action)",
  "automationConfig": { "alias": "...", "trigger": [...], "condition": [...], "action": [...], "mode": "single" },
  "explanation": "Step-by-step explanation of what each part does",
  "requiredEntities": ["entity_id_1", "entity_id_2"],
  "missingEntities": [{ "description": "What's needed", "suggestedDomain": "domain", "reason": "Why it's needed" }],
  "warnings": ["Any potential issues or caveats"],
  "confidence": 0.0-1.0
}

Rules:
- ONLY use entity_ids from the provided entity list. NEVER invent entities.
- If the user's intent requires entities that don't exist, list them in missingEntities and create the best automation possible with available entities.
- Include appropriate conditions (time, state checks) to make the automation robust.
- Use proper HA YAML syntax and service calls.
- Set an appropriate mode (single, restart, queued, parallel).
- Return valid JSON only, no markdown fences.`;

  const userPrompt = `## User's Intent
"${intent}"

${selectedEntities?.length ? `## Pre-selected Entities\n${selectedEntities.join("\n")}` : ""}
${conditions ? `## Additional Conditions\n${conditions}` : ""}

## Available Entities (${entities.length} total)
${entities.map((e) => `- ${e.entityId} (${e.domain})${e.friendlyName ? ` "${e.friendlyName}"` : ""}${e.areaId ? ` [area: ${e.areaId}]` : ""} state=${e.lastState || "unknown"}`).join("\n")}

## Areas
${areas.map((a) => `- ${a.haAreaId}: ${a.name}`).join("\n") || "No areas configured"}

## Existing Automations (for reference — avoid duplicating)
${existingAutomations.map((a) => `- ${a.alias || a.haAutomationId}`).join("\n") || "None"}`;

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const result = JSON.parse(cleaned);

    return NextResponse.json({
      ...result,
      tokensUsed: (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0),
    });
  } catch (error) {
    console.error("[automation-generate] Error:", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
