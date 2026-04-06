import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { HAClient } from "@/lib/ha-client";
import {
  formatAutomationYaml,
  validateAgainstHA,
  buildServiceDomainSet,
} from "@/lib/ai/automation-yaml";
import { parse } from "yaml";
import { syncAutomations } from "@/lib/sync-service";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 50);
}

/**
 * POST /api/automations/deploy — Deploy an AI-suggested automation to Home Assistant.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { insightId, instanceId, yamlOverride } = body as {
    insightId?: string;
    instanceId?: string;
    yamlOverride?: string;
  };

  if (!insightId || !instanceId) {
    return NextResponse.json(
      { error: "insightId and instanceId are required" },
      { status: 400 }
    );
  }

  // Verify instance ownership
  const [instance] = await db
    .select()
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  // Fetch the insight
  const [insight] = await db
    .select()
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.id, insightId),
        eq(schema.aiAnalyses.instanceId, instanceId)
      )
    )
    .limit(1);

  if (!insight) {
    return NextResponse.json(
      { error: "Insight not found" },
      { status: 404 }
    );
  }

  if (insight.type !== "automation") {
    return NextResponse.json(
      { error: "Insight is not an automation suggestion" },
      { status: 400 }
    );
  }

  const meta = insight.metadata as { automationYaml?: string; deployedAutomationId?: string } | null;

  if (meta?.deployedAutomationId) {
    return NextResponse.json(
      { error: "Automation is already deployed", automationId: meta.deployedAutomationId },
      { status: 409 }
    );
  }

  const yamlSource = yamlOverride || meta?.automationYaml;
  if (!yamlSource) {
    return NextResponse.json(
      { error: "No automation YAML available in this insight" },
      { status: 400 }
    );
  }

  // Step 1: Validate YAML structure
  const validation = formatAutomationYaml(yamlSource);
  if (!validation.valid) {
    return NextResponse.json(
      { error: "Invalid automation YAML", details: validation.errors },
      { status: 400 }
    );
  }

  // Step 2: Validate against live HA instance
  const client = new HAClient(instance.url, instance.encryptedToken);

  let haValidation: { errors: string[]; warnings: string[] };
  try {
    const [states, services] = await Promise.all([
      client.getStates(),
      client.getServices(),
    ]);
    const knownEntities = new Set(states.map((s) => s.entity_id));
    const knownServices = buildServiceDomainSet(services);
    haValidation = await validateAgainstHA(
      validation.yaml,
      knownEntities,
      knownServices
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to connect to Home Assistant for validation",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }

  if (haValidation.errors.length > 0) {
    return NextResponse.json(
      {
        error: "Automation references invalid entities or services",
        details: haValidation.errors,
        warnings: haValidation.warnings,
      },
      { status: 400 }
    );
  }

  // Step 3: Generate unique automation ID
  const parsed = parse(validation.yaml) as Record<string, unknown>;
  const alias = (parsed.alias as string) || insight.title;
  const shortId = crypto.randomUUID().slice(0, 8);
  const automationId = `smarthass_${slugify(alias)}_${shortId}`;

  // Step 4: Deploy to HA
  try {
    await client.createAutomation(automationId, parsed);
    await client.reloadAutomations();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to deploy automation to Home Assistant",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }

  // Step 5: Update insight status
  await db
    .update(schema.aiAnalyses)
    .set({
      status: "applied",
      metadata: {
        ...(insight.metadata as Record<string, unknown>),
        deployedAutomationId: automationId,
        deployedAt: new Date().toISOString(),
        // Store the actual deployed YAML (may have been edited by user)
        deployedYaml: validation.yaml,
      },
    })
    .where(eq(schema.aiAnalyses.id, insightId));

  // Step 6: Re-sync automations to refresh local DB
  try {
    await syncAutomations(instanceId, client);
  } catch {
    // Non-fatal: the automation was deployed successfully
    console.warn("[deploy] Failed to re-sync automations after deploy");
  }

  return NextResponse.json({
    success: true,
    automationId,
    warnings: [...validation.warnings, ...haValidation.warnings],
  });
}

/**
 * DELETE /api/automations/deploy — Remove a deployed automation from Home Assistant.
 */
export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { insightId, instanceId } = body as {
    insightId?: string;
    instanceId?: string;
  };

  if (!insightId || !instanceId) {
    return NextResponse.json(
      { error: "insightId and instanceId are required" },
      { status: 400 }
    );
  }

  // Verify instance ownership
  const [instance] = await db
    .select()
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance) {
    return NextResponse.json(
      { error: "Instance not found" },
      { status: 404 }
    );
  }

  // Fetch the insight
  const [insight] = await db
    .select()
    .from(schema.aiAnalyses)
    .where(
      and(
        eq(schema.aiAnalyses.id, insightId),
        eq(schema.aiAnalyses.instanceId, instanceId)
      )
    )
    .limit(1);

  if (!insight) {
    return NextResponse.json(
      { error: "Insight not found" },
      { status: 404 }
    );
  }

  const meta = insight.metadata as { deployedAutomationId?: string } | null;
  if (!meta?.deployedAutomationId) {
    return NextResponse.json(
      { error: "Automation is not deployed" },
      { status: 400 }
    );
  }

  // Delete from HA
  const client = new HAClient(instance.url, instance.encryptedToken);
  try {
    await client.deleteAutomation(meta.deployedAutomationId);
    await client.reloadAutomations();
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to remove automation from Home Assistant",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 502 }
    );
  }

  // Update insight: remove deployedAutomationId, reset status
  const { deployedAutomationId: _, deployedAt: __, deployedYaml: ___, ...cleanMeta } =
    insight.metadata as Record<string, unknown>;

  await db
    .update(schema.aiAnalyses)
    .set({
      status: "viewed",
      metadata: cleanMeta,
    })
    .where(eq(schema.aiAnalyses.id, insightId));

  // Re-sync automations
  try {
    await syncAutomations(instanceId, client);
  } catch {
    console.warn("[deploy] Failed to re-sync automations after undeploy");
  }

  return NextResponse.json({ success: true });
}
