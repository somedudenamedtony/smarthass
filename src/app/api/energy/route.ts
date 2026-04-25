import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq, and, desc, gte } from "drizzle-orm";

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

  // Get energy sensors with their latest readings
  const sensors = await db
    .select({
      id: schema.energySensors.id,
      sensorType: schema.energySensors.sensorType,
      unitOfMeasurement: schema.energySensors.unitOfMeasurement,
      deviceClass: schema.energySensors.deviceClass,
      costPerKwh: schema.energySensors.costPerKwh,
      entityId: schema.entities.entityId,
      friendlyName: schema.entities.friendlyName,
      lastState: schema.entities.lastState,
      lastChangedAt: schema.entities.lastChangedAt,
    })
    .from(schema.energySensors)
    .innerJoin(schema.entities, eq(schema.energySensors.entityDbId, schema.entities.id))
    .where(eq(schema.energySensors.instanceId, instanceId));

  // Get recent daily stats for energy sensors
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const dailyStats = await db
    .select({
      energySensorId: schema.energyDailyStats.energySensorId,
      date: schema.energyDailyStats.date,
      totalConsumption: schema.energyDailyStats.totalConsumption,
      totalProduction: schema.energyDailyStats.totalProduction,
      netConsumption: schema.energyDailyStats.netConsumption,
      peakConsumption: schema.energyDailyStats.peakConsumption,
      costEstimate: schema.energyDailyStats.costEstimate,
      hourlyData: schema.energyDailyStats.hourlyData,
    })
    .from(schema.energyDailyStats)
    .where(gte(schema.energyDailyStats.date, weekAgo))
    .orderBy(desc(schema.energyDailyStats.date));

  // Group stats by sensor
  const statsBySensor = new Map<string, typeof dailyStats>();
  for (const stat of dailyStats) {
    const existing = statsBySensor.get(stat.energySensorId) ?? [];
    existing.push(stat);
    statsBySensor.set(stat.energySensorId, existing);
  }

  // Calculate summary
  let todayConsumption = 0;
  let yesterdayConsumption = 0;
  let weeklyTotal = 0;
  
  for (const [sensorId, stats] of statsBySensor) {
    const sensor = sensors.find((s) => s.id === sensorId);
    if (sensor?.sensorType === "consumption") {
      for (const stat of stats) {
        const consumption = Number(stat.totalConsumption) || 0;
        weeklyTotal += consumption;
        if (stat.date === today) {
          todayConsumption += consumption;
        } else if (stats.indexOf(stat) === 1) {
          yesterdayConsumption += consumption;
        }
      }
    }
  }

  const weeklyAverage = weeklyTotal / 7;

  // Find primary energy sensor for unit
  const primarySensor = sensors.find((s) => s.sensorType === "consumption");
  const unit = primarySensor?.unitOfMeasurement ?? "kWh";

  // Estimate cost based on average rate
  const avgCostPerKwh = sensors
    .filter((s) => s.costPerKwh)
    .reduce((sum, s) => sum + Number(s.costPerKwh), 0) / sensors.filter((s) => s.costPerKwh).length || 0.12;

  return NextResponse.json({
    sensors,
    summary: {
      todayConsumption,
      yesterdayConsumption,
      weeklyAverage,
      weeklyTotal,
      unit,
      costEstimate: todayConsumption * avgCostPerKwh,
    },
    dailyStats: Object.fromEntries(statsBySensor),
  });
}
