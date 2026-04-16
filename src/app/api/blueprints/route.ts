import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createBlueprintGenerator } from "@/lib/blueprint-generator";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const status = searchParams.get("status");

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  // Verify instance ownership
  const instance = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Get blueprints
  let query = db
    .select({
      id: schema.blueprints.id,
      name: schema.blueprints.name,
      description: schema.blueprints.description,
      domain: schema.blueprints.domain,
      status: schema.blueprints.status,
      sourceEntities: schema.blueprints.sourceEntities,
      inputSchema: schema.blueprints.inputSchema,
      blueprintYaml: schema.blueprints.blueprintYaml,
      deployCount: schema.blueprints.deployCount,
      exportedAt: schema.blueprints.exportedAt,
      createdAt: schema.blueprints.createdAt,
    })
    .from(schema.blueprints)
    .where(eq(schema.blueprints.instanceId, instanceId))
    .orderBy(desc(schema.blueprints.createdAt));

  const blueprints = await query;

  // Filter by status if provided
  const filtered = status
    ? blueprints.filter((b) => b.status === status)
    : blueprints;

  return NextResponse.json({ blueprints: filtered });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { instanceId, action, blueprintId, automation, name, description, sourceEntities } = body;

  if (!instanceId) {
    return NextResponse.json({ error: "instanceId required" }, { status: 400 });
  }

  // Verify instance ownership
  const instance = await db
    .select({ id: schema.haInstances.id })
    .from(schema.haInstances)
    .where(
      and(
        eq(schema.haInstances.id, instanceId),
        eq(schema.haInstances.userId, session.user.id)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  const generator = createBlueprintGenerator();

  // Handle actions
  if (action === "generate" && automation) {
    // Generate a blueprint from an automation config
    const blueprint = generator.generateFromAutomation(
      name || "Generated Blueprint",
      description || "",
      automation,
      {
        parameterizeEntities: true,
        parameterizeTime: true,
        parameterizeThresholds: true,
      }
    );

    const blueprintId = await generator.storeBlueprint(
      instanceId,
      null, // analysisId
      name || "Generated Blueprint",
      description || "",
      blueprint,
      sourceEntities || []
    );

    return NextResponse.json({
      blueprintId,
      yaml: generator.toYaml(blueprint),
    });
  }

  if (action === "export" && blueprintId) {
    await generator.updateStatus(blueprintId, "exported");
    
    const blueprint = await generator.getBlueprint(blueprintId);
    if (!blueprint) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    return NextResponse.json({
      yaml: blueprint.blueprintYaml,
      filename: `${blueprint.name.toLowerCase().replace(/\s+/g, "_")}.yaml`,
    });
  }

  if (action === "delete" && blueprintId) {
    await generator.deleteBlueprint(blueprintId);
    return NextResponse.json({ success: true });
  }

  if (action === "activate" && blueprintId) {
    await generator.updateStatus(blueprintId, "active");
    return NextResponse.json({ success: true });
  }

  if (action === "archive" && blueprintId) {
    await generator.updateStatus(blueprintId, "archived");
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
