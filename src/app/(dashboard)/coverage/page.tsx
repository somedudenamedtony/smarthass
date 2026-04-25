"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  MapPin,
  Wifi,
  WifiOff,
  Thermometer,
  Eye,
  Lightbulb,
  Lock,
  Wind,
  Speaker,
  DoorOpen,
  Gauge,
} from "lucide-react";

interface HAInstance {
  id: string;
  name: string;
}

interface SensorCoverage {
  type: string;
  present: boolean;
  entities: Array<{ entityId: string; friendlyName: string | null }>;
  count: number;
}

interface Gap {
  type: "sensor" | "actuator";
  missing: string;
  impact: string;
}

interface AreaCoverage {
  area: { id: string; haAreaId: string; name: string; floorId: string | null; icon: string | null };
  roomType: string;
  entityCount: number;
  sensorCoverage: SensorCoverage[];
  actuatorCoverage: SensorCoverage[];
  sensorScore: number;
  actuatorScore: number;
  overallScore: number;
  gaps: Gap[];
}

interface CoverageSummary {
  totalAreas: number;
  totalEntities: number;
  unassignedEntities: number;
  averageCoverageScore: number;
  totalGaps: number;
  totalAutomations: number;
  domainBreakdown: Record<string, number>;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

function getScoreBg(score: number): string {
  if (score >= 80) return "bg-success/15";
  if (score >= 50) return "bg-warning/15";
  return "bg-destructive/15";
}

function getTypeIcon(type: string) {
  if (type.includes("motion")) return Eye;
  if (type.includes("temperature") || type.includes("thermo")) return Thermometer;
  if (type.includes("humidity") || type.includes("wind") || type === "fan") return Wind;
  if (type.includes("door") || type.includes("window")) return DoorOpen;
  if (type.includes("smoke")) return AlertTriangle;
  if (type === "light") return Lightbulb;
  if (type === "lock") return Lock;
  if (type === "climate") return Thermometer;
  if (type === "cover") return DoorOpen;
  if (type === "media_player") return Speaker;
  if (type === "switch") return Gauge;
  return Shield;
}

export default function CoveragePage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [areas, setAreas] = useState<AreaCoverage[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadCoverage = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      const res = await fetch(`/api/coverage?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setAreas(data.areas || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error("Failed to load coverage:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) loadCoverage();
  }, [selectedInstance, loadCoverage]);

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
        <h1 className="text-2xl font-semibold">Coverage Map</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Home Assistant instance connected</p>
            <p className="text-muted-foreground mb-4">Connect an instance to analyze your sensor coverage</p>
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
          <h1 className="text-2xl font-semibold">Coverage Map</h1>
          <p className="text-muted-foreground">Sensor and actuator coverage analysis by area</p>
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
          <Button variant="outline" size="sm" onClick={() => { setRefreshing(true); loadCoverage(); }} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className={`text-3xl font-bold ${getScoreColor(summary.averageCoverageScore)}`}>
                {summary.averageCoverageScore}%
              </div>
              <p className="text-sm text-muted-foreground">Avg Coverage</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{summary.totalAreas}</div>
              <p className="text-sm text-muted-foreground">Areas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-destructive">{summary.totalGaps}</div>
              <p className="text-sm text-muted-foreground">Gaps Found</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{summary.totalEntities}</div>
              <p className="text-sm text-muted-foreground">Total Entities</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Area Cards */}
      {areas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No areas configured</p>
            <p className="text-muted-foreground text-sm text-center max-w-md">
              Define areas in Home Assistant and assign entities to them.
              Areas will appear here after syncing.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {areas.map((areaCov) => (
            <Card key={areaCov.area.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    {areaCov.area.name}
                    <Badge variant="outline" className="text-xs ml-1">{areaCov.roomType}</Badge>
                  </CardTitle>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${getScoreBg(areaCov.overallScore)} ${getScoreColor(areaCov.overallScore)}`}>
                    {areaCov.overallScore >= 80 ? <ShieldCheck className="h-4 w-4" /> :
                     areaCov.overallScore >= 50 ? <Shield className="h-4 w-4" /> :
                     <ShieldAlert className="h-4 w-4" />}
                    {areaCov.overallScore}%
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{areaCov.entityCount} entities</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Sensor Coverage */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Sensors ({areaCov.sensorScore}%)</p>
                  <div className="flex flex-wrap gap-2">
                    {areaCov.sensorCoverage.map((sensor) => {
                      const Icon = getTypeIcon(sensor.type);
                      return (
                        <div
                          key={sensor.type}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                            sensor.present ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          }`}
                          title={sensor.present ? sensor.entities.map((e) => e.friendlyName || e.entityId).join(", ") : `Missing: ${sensor.type}`}
                        >
                          {sensor.present ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          <Icon className="h-3 w-3" />
                          <span>{sensor.type.split(".").pop()}</span>
                          {sensor.count > 1 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{sensor.count}</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actuator Coverage */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Controls ({areaCov.actuatorScore}%)</p>
                  <div className="flex flex-wrap gap-2">
                    {areaCov.actuatorCoverage.map((act) => {
                      const Icon = getTypeIcon(act.type);
                      return (
                        <div
                          key={act.type}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                            act.present ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                          }`}
                          title={act.present ? act.entities.map((e) => e.friendlyName || e.entityId).join(", ") : `Missing: ${act.type}`}
                        >
                          {act.present ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                          <Icon className="h-3 w-3" />
                          <span>{act.type}</span>
                          {act.count > 1 && <Badge variant="secondary" className="text-[10px] h-4 px-1">{act.count}</Badge>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Gaps */}
                {areaCov.gaps.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-destructive uppercase mb-2">Gaps ({areaCov.gaps.length})</p>
                    <div className="space-y-1">
                      {areaCov.gaps.map((gap, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <Info className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{gap.impact}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Domain Breakdown */}
      {summary && Object.keys(summary.domainBreakdown).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Entity Domain Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(summary.domainBreakdown)
                .sort((a, b) => b[1] - a[1])
                .map(([domain, count]) => (
                  <Badge key={domain} variant="secondary" className="text-sm">
                    {domain}: {count}
                  </Badge>
                ))}
            </div>
            {summary.unassignedEntities > 0 && (
              <p className="text-sm text-muted-foreground mt-3">
                <AlertTriangle className="h-4 w-4 inline mr-1 text-warning" />
                {summary.unassignedEntities} entities not assigned to any area
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
