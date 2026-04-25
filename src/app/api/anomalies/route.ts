import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createAnomalyDetector } from "@/lib/anomaly-detector";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const instanceId = searchParams.get("instanceId");
  const status = searchParams.get("status") || "active";
  const limit = parseInt(searchParams.get("limit") || "20", 10);

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

  // Get anomaly alerts
  const alerts = await db
    .select({
      id: schema.anomalyAlerts.id,
      severity: schema.anomalyAlerts.severity,
      status: schema.anomalyAlerts.status,
      title: schema.anomalyAlerts.title,
      description: schema.anomalyAlerts.description,
      detectedValue: schema.anomalyAlerts.detectedValue,
      expectedRange: schema.anomalyAlerts.expectedRange,
      deviationScore: schema.anomalyAlerts.deviationScore,
      detectedAt: schema.anomalyAlerts.detectedAt,
      acknowledgedAt: schema.anomalyAlerts.acknowledgedAt,
      resolvedAt: schema.anomalyAlerts.resolvedAt,
      metadata: schema.anomalyAlerts.metadata,
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      domain: schema.entities.domain,
    })
    .from(schema.anomalyAlerts)
    .leftJoin(schema.entities, eq(schema.anomalyAlerts.entityDbId, schema.entities.id))
    .where(
      and(
        eq(schema.anomalyAlerts.instanceId, instanceId),
        status === "all" ? undefined : eq(schema.anomalyAlerts.status, status as typeof schema.anomalyAlerts.status.enumValues[number])
      )
    )
    .orderBy(desc(schema.anomalyAlerts.detectedAt))
    .limit(limit);

  // Count by severity
  const counts = {
    critical: alerts.filter((a) => a.severity === "critical" && a.status === "active").length,
    warning: alerts.filter((a) => a.severity === "warning" && a.status === "active").length,
    info: alerts.filter((a) => a.severity === "info" && a.status === "active").length,
    total: alerts.filter((a) => a.status === "active").length,
  };

  return NextResponse.json({ alerts, counts });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { instanceId, action, alertId } = body;

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

  const detector = createAnomalyDetector();

  // Handle actions
  if (action === "detect") {
    // Run anomaly detection
    const anomalies = await detector.detectForInstance(instanceId);
    await detector.storeAnomalies(instanceId, anomalies);
    
    return NextResponse.json({
      detected: anomalies.length,
      anomalies: anomalies.slice(0, 10), // Return first 10 for preview
    });
  }

  if (action === "acknowledge" && alertId) {
    await detector.acknowledgeAlert(alertId);
    return NextResponse.json({ success: true });
  }

  if (action === "dismiss" && alertId) {
    await detector.dismissAlert(alertId);
    return NextResponse.json({ success: true });
  }

  if (action === "resolve" && alertId) {
    await detector.resolveAlert(alertId);
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
