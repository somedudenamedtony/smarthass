import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { getAnthropicApiKey } from "@/lib/app-config";
import Anthropic from "@anthropic-ai/sdk";

function hashAutomationConfig(automation: {
  triggerConfig: unknown;
  conditionConfig: unknown;
  actionConfig: unknown;
}): string {
  const data = JSON.stringify({
    t: automation.triggerConfig,
    c: automation.conditionConfig,
    a: automation.actionConfig,
  });
  return createHash("sha256").update(data).digest("hex").slice(0, 16);
}

/**
 * POST /api/automations/[id]/review — AI review of a single automation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Fetch automation
  const [automation] = await db
    .select()
    .from(schema.automations)
    .where(eq(schema.automations.id, id))
    .limit(1);

  if (!automation) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  // Verify ownership
  const [instance] = await db
    .select({ id: schema.haInstances.id, url: schema.haInstances.url })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, automation.instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 403 });
  }

  // Check for cached review with same config hash
  const configHash = hashAutomationConfig(automation);
  const [cached] = await db
    .select()
    .from(schema.automationReviews)
    .where(
      and(
        eq(schema.automationReviews.automationId, id),
        eq(schema.automationReviews.configHash, configHash)
      )
    )
    .orderBy(desc(schema.automationReviews.createdAt))
    .limit(1);

  if (cached) {
    return NextResponse.json({
      review: cached,
      cached: true,
    });
  }

  // Get API key
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Anthropic API key not configured" },
      { status: 503 }
    );
  }

  // Get all entities for this instance (for reference in review)
  const entities = await db
    .select({
      entityId: schema.entities.entityId,
      domain: schema.entities.domain,
      friendlyName: schema.entities.friendlyName,
      areaId: schema.entities.areaId,
      lastState: schema.entities.lastState,
    })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, automation.instanceId));

  // Build review prompt
  const systemPrompt = `You are a Home Assistant automation expert performing a detailed code review. Analyze the automation and return a JSON object with:
{
  "healthScore": 0-100,
  "summary": "2-3 sentence overall assessment",
  "findings": [
    {
      "severity": "critical" | "warning" | "info" | "positive",
      "category": "reliability" | "optimization" | "conditions" | "triggers" | "actions" | "security" | "maintainability",
      "title": "Short finding title",
      "description": "Detailed explanation of the issue and why it matters",
      "suggestion": "Specific improvement recommendation"
    }
  ],
  "improvedYaml": "Complete improved automation YAML (valid HA format)"
}

Scoring guide:
- 90-100: Excellent — well-structured, handles edge cases
- 70-89: Good — works but has room for improvement
- 50-69: Fair — functional but missing important conditions/handling
- 30-49: Poor — likely to cause unexpected behavior
- 0-29: Critical — security or reliability risks

Evaluate: reliability (error handling, fallbacks, race conditions), optimization (redundant actions, trigger frequency), missing conditions (time guards, presence, state validation), trigger quality, action completeness, security (door/security automations), maintainability (hardcoded values, duplication).

CRITICAL: Only reference entity_ids from the provided entity list. Return valid JSON only, no markdown fences.`;

  const userPrompt = `## Automation to Review
Name: ${automation.alias || automation.haAutomationId}
${automation.description ? `Description: ${automation.description}` : ""}
Status: ${automation.enabled ? "enabled" : "disabled"}
Last Triggered: ${automation.lastTriggered ? automation.lastTriggered.toISOString() : "never"}

### Triggers
${JSON.stringify(automation.triggerConfig, null, 2)}

### Conditions
${JSON.stringify(automation.conditionConfig, null, 2)}

### Actions
${JSON.stringify(automation.actionConfig, null, 2)}

## Available Entities
${entities.map((e) => `- ${e.entityId} (${e.domain})${e.friendlyName ? ` "${e.friendlyName}"` : ""}${e.areaId ? ` [${e.areaId}]` : ""} state=${e.lastState || "unknown"}`).join("\n")}`;

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

    const tokensUsed = (response.usage?.input_tokens ?? 0) + (response.usage?.output_tokens ?? 0);
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    const result = JSON.parse(cleaned);

    // Store review
    const [review] = await db
      .insert(schema.automationReviews)
      .values({
        instanceId: automation.instanceId,
        automationId: id,
        configHash,
        healthScore: result.healthScore ?? 0,
        findings: result.findings ?? [],
        improvedYaml: result.improvedYaml ?? null,
        summary: result.summary ?? null,
        tokensUsed,
      })
      .returning();

    return NextResponse.json({ review, cached: false });
  } catch (error) {
    console.error("[automation-review] Error:", error);
    return NextResponse.json(
      { error: "Review failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/automations/[id]/review — get cached review for an automation
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [review] = await db
    .select()
    .from(schema.automationReviews)
    .where(eq(schema.automationReviews.automationId, id))
    .orderBy(desc(schema.automationReviews.createdAt))
    .limit(1);

  if (!review) {
    return NextResponse.json({ review: null });
  }

  return NextResponse.json({ review });
}
