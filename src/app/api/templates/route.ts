import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getAnthropicApiKey } from "@/lib/app-config";
import Anthropic from "@anthropic-ai/sdk";

/**
 * GET /api/templates — list automation templates
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const category = searchParams.get("category");

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

  // Get user's entities for match scoring
  const entities = await db
    .select({ domain: schema.entities.domain })
    .from(schema.entities)
    .where(eq(schema.entities.instanceId, instanceId));

  const userDomains = new Set(entities.map((e) => e.domain));

  // Get templates (curated + instance-specific)
  const conditions = [
    sql`(${schema.automationTemplates.isCurated} = true OR ${schema.automationTemplates.instanceId} = ${instanceId})`,
  ];

  const templates = await db
    .select()
    .from(schema.automationTemplates)
    .where(and(...conditions))
    .orderBy(desc(schema.automationTemplates.createdAt));

  // Calculate match scores
  const scored = templates
    .filter((t) => !category || t.category === category)
    .map((t) => {
      const required = (t.requiredDomains as string[]) || [];
      const optional = (t.optionalDomains as string[]) || [];
      const requiredMatches = required.filter((d) => userDomains.has(d)).length;
      const optionalMatches = optional.filter((d) => userDomains.has(d)).length;
      const requiredScore = required.length > 0 ? requiredMatches / required.length : 1;
      const optionalScore = optional.length > 0 ? optionalMatches / optional.length : 0;
      const matchScore = Math.round((requiredScore * 0.7 + optionalScore * 0.3) * 100);
      const canDeploy = requiredScore === 1;

      return { ...t, matchScore, canDeploy };
    })
    .sort((a, b) => b.matchScore - a.matchScore);

  // Get unique categories
  const categories = [...new Set(templates.map((t) => t.category))].sort();

  return NextResponse.json({ templates: scored, categories });
}

/**
 * POST /api/templates — generate or manage templates
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { action, instanceId } = body;

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

  if (action === "generate") {
    // AI-generate personalized templates based on user's entity setup
    const apiKey = await getAnthropicApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "Anthropic API key not configured" }, { status: 503 });
    }

    const entities = await db
      .select({
        entityId: schema.entities.entityId,
        domain: schema.entities.domain,
        friendlyName: schema.entities.friendlyName,
        areaId: schema.entities.areaId,
      })
      .from(schema.entities)
      .where(eq(schema.entities.instanceId, instanceId));

    const areas = await db
      .select({ haAreaId: schema.areas.haAreaId, name: schema.areas.name })
      .from(schema.areas)
      .where(eq(schema.areas.instanceId, instanceId));

    const existingTemplates = await db
      .select({ name: schema.automationTemplates.name })
      .from(schema.automationTemplates)
      .where(
        sql`${schema.automationTemplates.instanceId} = ${instanceId} OR ${schema.automationTemplates.isCurated} = true`
      );

    const systemPrompt = `You are a Home Assistant automation template designer. Based on the user's available entities and areas, generate practical automation templates they can deploy.

Return a JSON array of 5-8 templates:
[
  {
    "name": "Template name",
    "description": "What this template does and why it's useful",
    "category": "morning_routine" | "away_mode" | "comfort" | "security" | "energy_saving" | "convenience" | "entertainment" | "climate" | "lighting" | "notifications",
    "icon": "lucide icon name (sun, shield, thermometer, lightbulb, bell, etc.)",
    "useCase": "Specific scenario description",
    "requiredDomains": ["light", "binary_sensor"],
    "optionalDomains": ["climate", "cover"],
    "templateYaml": "Complete HA automation YAML with !input placeholders for customizable parts",
    "inputSchema": { "input_name": { "name": "Display Name", "description": "...", "selector": { "entity": { "domain": "light" } } } },
    "exampleConfig": { "input_name": "light.living_room" }
  }
]

Rules:
- Only suggest templates that match the user's available entity domains
- Use !input syntax for entity selections and customizable values
- Make templates practical and immediately useful
- Don't duplicate existing templates
- Include a mix of simple (1-2 triggers) and complex (multiple conditions) templates
- Category should reflect the use case, not the device type
Return valid JSON only, no markdown fences.`;

    const domainCounts = new Map<string, number>();
    for (const e of entities) {
      domainCounts.set(e.domain, (domainCounts.get(e.domain) || 0) + 1);
    }

    const userPrompt = `## User's Setup
### Entity Domains
${[...domainCounts.entries()].sort((a, b) => b[1] - a[1]).map(([d, c]) => `- ${d}: ${c} entities`).join("\n")}

### Areas
${areas.map((a) => `- ${a.name}`).join("\n") || "No areas configured"}

### Sample Entities (by domain)
${[...domainCounts.keys()].map((domain) => {
  const domainEntities = entities.filter((e) => e.domain === domain).slice(0, 5);
  return `${domain}: ${domainEntities.map((e) => e.entityId).join(", ")}`;
}).join("\n")}

### Existing Templates (don't duplicate)
${existingTemplates.map((t) => `- ${t.name}`).join("\n") || "None"}`;

    try {
      const client = new Anthropic({ apiKey });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userPrompt }],
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      const templates = JSON.parse(text);

      // Store generated templates
      let stored = 0;
      for (const t of templates) {
        await db.insert(schema.automationTemplates).values({
          instanceId,
          name: t.name,
          description: t.description,
          category: t.category,
          icon: t.icon,
          useCase: t.useCase || t.description || t.name,
          requiredDomains: t.requiredDomains || [],
          optionalDomains: t.optionalDomains || [],
          templateYaml: t.templateYaml,
          inputSchema: t.inputSchema || {},
          exampleConfig: t.exampleConfig || {},
          isCurated: false,
        });
        stored++;
      }

      return NextResponse.json({ generated: stored });
    } catch (error) {
      console.error("[templates-generate] Error:", error);
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }
  }

  if (action === "delete") {
    const { templateId } = body;
    if (!templateId) {
      return NextResponse.json({ error: "templateId required" }, { status: 400 });
    }
    await db
      .delete(schema.automationTemplates)
      .where(
        and(
          eq(schema.automationTemplates.id, templateId),
          eq(schema.automationTemplates.instanceId, instanceId)
        )
      );
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
