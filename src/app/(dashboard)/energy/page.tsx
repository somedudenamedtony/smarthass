"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  DollarSign,
  Calendar,
  RefreshCw,
  BarChart3,
  Settings,
} from "lucide-react";

interface EnergySensor {
  id: string;
  sensorType: string;
  unitOfMeasurement: string;
  deviceClass: string;
  entityId: string;
  friendlyName: string;
  lastState: string;
  lastChangedAt: string;
}

interface EnergySummary {
  todayConsumption: number;
  yesterdayConsumption: number;
  weeklyAverage: number;
  weeklyTotal: number;
  unit: string;
  costEstimate: number;
}

interface HAInstance {
  id: string;
  name: string;
}

export default function EnergyPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [sensors, setSensors] = useState<EnergySensor[]>([]);
  const [summary, setSummary] = useState<EnergySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load instances
  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  // Load energy data
  const loadEnergy = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      const res = await fetch(`/api/energy?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setSensors(data.sensors || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Failed to load energy data:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) {
      loadEnergy();
    }
  }, [selectedInstance, loadEnergy]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadEnergy();
  };

  const changePercent = summary?.yesterdayConsumption
    ? ((summary.todayConsumption - summary.yesterdayConsumption) / summary.yesterdayConsumption) * 100
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!selectedInstance) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Energy Dashboard</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gauge className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Home Assistant instance connected</p>
            <p className="text-muted-foreground mb-4">Connect an instance to view energy data</p>
            <Button onClick={() => window.location.href = "/settings"}>
              Go to Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Energy Dashboard</h1>
          <p className="text-muted-foreground">Monitor your home energy consumption</p>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Today's Consumption */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {summary.todayConsumption.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">{summary.unit}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                {changePercent > 0 ? (
                  <TrendingUp className="h-3 w-3 text-destructive" />
                ) : changePercent < 0 ? (
                  <TrendingDown className="h-3 w-3 text-success" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={`text-xs ${changePercent > 0 ? "text-destructive" : "text-success"}`}>
                  {changePercent > 0 ? "+" : ""}{changePercent.toFixed(1)}% vs yesterday
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Yesterday */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Yesterday
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {summary.yesterdayConsumption.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">{summary.unit}</span>
              </div>
            </CardContent>
          </Card>

          {/* Weekly Average */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                7-Day Average
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {summary.weeklyAverage.toFixed(1)}
                <span className="text-sm font-normal text-muted-foreground ml-1">{summary.unit}/day</span>
              </div>
            </CardContent>
          </Card>

          {/* Cost Estimate */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Estimated Cost
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                ${summary.costEstimate.toFixed(2)}
                <span className="text-sm font-normal text-muted-foreground ml-1">today</span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Gauge className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No energy sensors detected</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              SmartHass automatically detects energy sensors (power, energy, gas, water) from your Home Assistant instance.
              Make sure you have energy monitoring configured in HA.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Energy Sensors */}
      {sensors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Energy Sensors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {sensors.map((sensor) => (
                <div
                  key={sensor.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-accent/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-energy/15">
                      <Zap className="h-4 w-4 text-energy" />
                    </div>
                    <div>
                      <p className="font-medium">{sensor.friendlyName || sensor.entityId}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {sensor.sensorType} • {sensor.deviceClass}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold">
                      {sensor.lastState}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        {sensor.unitOfMeasurement}
                      </span>
                    </p>
                    <Badge variant="secondary" className="text-xs">
                      {sensor.sensorType}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Energy Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Tip 1:</strong> Use the AI Insights feature to identify 
              devices that consume more energy than expected.
            </p>
            <p>
              <strong className="text-foreground">Tip 2:</strong> Set up automations to turn off high-power 
              devices when not in use.
            </p>
            <p>
              <strong className="text-foreground">Tip 3:</strong> Configure time-of-use rates in Home Assistant 
              to optimize when energy-intensive tasks run.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
