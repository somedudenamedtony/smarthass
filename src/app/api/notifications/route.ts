import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/notifications — list notifications for an instance
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

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

  const conditions = [eq(schema.notifications.instanceId, instanceId)];
  if (unreadOnly) {
    conditions.push(eq(schema.notifications.isRead, false));
  }

  const notifications = await db
    .select()
    .from(schema.notifications)
    .where(and(...conditions))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50);

  const unreadCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.instanceId, instanceId),
        eq(schema.notifications.isRead, false)
      )
    );

  return NextResponse.json({
    notifications,
    unreadCount: unreadCount[0]?.count ?? 0,
  });
}

/**
 * PATCH /api/notifications — mark notifications as read
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ids, markAllRead, instanceId } = await request.json();

  if (markAllRead && instanceId) {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.instanceId, instanceId));
    return NextResponse.json({ success: true });
  }

  if (ids?.length) {
    for (const id of ids) {
      await db
        .update(schema.notifications)
        .set({ isRead: true })
        .where(eq(schema.notifications.id, id));
    }
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "ids or markAllRead required" }, { status: 400 });
}
