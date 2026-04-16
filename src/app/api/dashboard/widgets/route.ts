import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");

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

  // Get dashboard widgets
  const widgets = await db
    .select({
      id: schema.dashboardWidgets.id,
      widgetType: schema.dashboardWidgets.widgetType,
      title: schema.dashboardWidgets.title,
      position: schema.dashboardWidgets.position,
      width: schema.dashboardWidgets.width,
      height: schema.dashboardWidgets.height,
      config: schema.dashboardWidgets.config,
      isVisible: schema.dashboardWidgets.isVisible,
    })
    .from(schema.dashboardWidgets)
    .where(
      and(
        eq(schema.dashboardWidgets.instanceId, instanceId),
        eq(schema.dashboardWidgets.userId, session.user.id)
      )
    );

  return NextResponse.json({ 
    widgets: widgets.map(w => ({
      ...w,
      type: w.widgetType,
      size: { w: w.width, h: w.height },
    }))
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id; // Extract after validation
  const body = await request.json();
  const { instanceId, action, widgets, widget, widgetId, updates } = body;

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
        eq(schema.haInstances.userId, userId)
      )
    )
    .limit(1);

  if (!instance[0]) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Save all widgets at once
  if (action === "save" && Array.isArray(widgets)) {
    // Delete existing widgets for this user/instance
    await db
      .delete(schema.dashboardWidgets)
      .where(
        and(
          eq(schema.dashboardWidgets.instanceId, instanceId),
          eq(schema.dashboardWidgets.userId, userId)
        )
      );

    // Insert new widgets
    if (widgets.length > 0) {
      await db.insert(schema.dashboardWidgets).values(
        widgets.map((w: any, index: number) => ({
          id: w.id || crypto.randomUUID(),
          instanceId,
          userId,
          widgetType: w.type,
          title: w.title,
          position: w.position ?? index,
          width: w.size?.w ?? 1,
          height: w.size?.h ?? 1,
          config: w.config || {},
        }))
      );
    }

    return NextResponse.json({ success: true });
  }

  // Add a single widget
  if (action === "add" && widget) {
    const id = crypto.randomUUID();
    await db.insert(schema.dashboardWidgets).values({
      id,
      instanceId,
      userId,
      widgetType: widget.type,
      title: widget.title,
      position: widget.position ?? 0,
      width: widget.size?.w ?? 1,
      height: widget.size?.h ?? 1,
      config: widget.config || {},
    });

    return NextResponse.json({ success: true, widgetId: id });
  }

  // Update a widget
  if (action === "update" && widgetId && updates) {
    const updateData: Record<string, unknown> = {};
    if (updates.title) updateData.title = updates.title;
    if (updates.position !== undefined) updateData.position = updates.position;
    if (updates.size?.w !== undefined) updateData.width = updates.size.w;
    if (updates.size?.h !== undefined) updateData.height = updates.size.h;
    if (updates.config) updateData.config = updates.config;

    await db
      .update(schema.dashboardWidgets)
      .set(updateData)
      .where(
        and(
          eq(schema.dashboardWidgets.id, widgetId),
          eq(schema.dashboardWidgets.userId, userId)
        )
      );

    return NextResponse.json({ success: true });
  }

  // Remove a widget
  if (action === "remove" && widgetId) {
    await db
      .delete(schema.dashboardWidgets)
      .where(
        and(
          eq(schema.dashboardWidgets.id, widgetId),
          eq(schema.dashboardWidgets.userId, userId)
        )
      );

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
