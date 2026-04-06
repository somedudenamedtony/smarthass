import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { dashboardPreferencesSchema, formatZodError } from "@/lib/validators";

/**
 * GET /api/dashboard/preferences — get user's dashboard preferences
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user] = await db
    .select({ dashboardPreferences: schema.users.dashboardPreferences })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .limit(1);

  return NextResponse.json({
    preferences: user?.dashboardPreferences ?? {
      widgetOrder: null,
      hiddenWidgets: [],
      pinnedEntityIds: [],
    },
  });
}

/**
 * PATCH /api/dashboard/preferences — update dashboard preferences
 */
export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = dashboardPreferencesSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatZodError(parsed.error) },
      { status: 400 }
    );
  }

  await db
    .update(schema.users)
    .set({ dashboardPreferences: parsed.data })
    .where(eq(schema.users.id, session.user.id));

  return NextResponse.json({ success: true, preferences: parsed.data });
}
