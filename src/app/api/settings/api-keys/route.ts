import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getConfig, setConfig, deleteConfig, hasConfig } from "@/lib/app-config";

/**
 * GET /api/settings/api-keys — check which API keys are configured
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    anthropicKey: await hasConfig("ANTHROPIC_API_KEY"),
  });
}

/**
 * PUT /api/settings/api-keys — update API keys
 * Body: { anthropicKey?: string }
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  if (typeof body.anthropicKey === "string") {
    const key = body.anthropicKey.trim();
    if (key) {
      await setConfig("ANTHROPIC_API_KEY", key, true);
    } else {
      await deleteConfig("ANTHROPIC_API_KEY");
    }
  }

  return NextResponse.json({ success: true });
}
