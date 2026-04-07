import { NextResponse } from "next/server";
import { getDeployMode } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    mode: getDeployMode(),
    timestamp: new Date().toISOString(),
  });
}
