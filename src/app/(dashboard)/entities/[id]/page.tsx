"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { EntityHistoryChart } from "@/components/charts/entity-history-chart";
import { DailyStatsChart } from "@/components/charts/daily-stats-chart";
import { InsightCard, type Insight } from "@/components/insights/insight-card";
import { useToast } from "@/components/toast";

interface EntityDetail {
  id: string;
  instanceId: string;
  entityId: string;
  domain: string;
  platform: string | null;
  friendlyName: string | null;
  areaId: string | null;
  deviceId: string | null;
  attributes: Record<string, unknown> | null;
  lastState: string | null;
  lastChangedAt: string | null;
  isTracked: boolean;
  createdAt: string;
}

interface DailyStat {
  id: string;
  date: string;
  stateChanges: number;
  activeTime: number;
  avgValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  stateDistribution: Record<string, number> | null;
}

interface PeriodStats {
  totalStateChanges: number;
  totalActiveTime: number;
  avgDailyChanges: number;
  avgDailyActiveTime: number;
  days: number;
}

interface HistoryPoint {
  state: string;
  last_changed: string;
}

const TIME_RANGES = [7, 14, 30, 90] as const;

export default function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([]);
  const [previousStats, setPreviousStats] = useState<DailyStat[]>([]);
  const [currentPeriodStats, setCurrentPeriodStats] = useState<PeriodStats | null>(null);
  const [previousPeriodStats, setPreviousPeriodStats] = useState<PeriodStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [entityInsights, setEntityInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<number>(30);
  const { toast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/entities/${id}?days=${days}`);
        if (res.ok) {
          const data = await res.json();
          setEntity(data.entity);
          setDailyStats(data.dailyStats);
          setCurrentPeriodStats(data.currentPeriodStats);
          setPreviousPeriodStats(data.previousPeriodStats);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, days]);

  const loadHistory = useCallback(async () => {
    if (!entity) return;
    const start = new Date();
    start.setDate(start.getDate() - 1);
    const params = new URLSearchParams({
      instanceId: entity.instanceId,
      start: start.toISOString(),
      entityIds: entity.entityId,
    });
    const res = await fetch(`/api/ha/history?${params}`);
    if (res.ok) {
      const data: HistoryPoint[][] = await res.json();
      setHistory(data[0] ?? []);
    }
  }, [entity]);

  useEffect(() => {
    if (entity) loadHistory();
  }, [entity, loadHistory]);

  // Load entity-specific insights
  useEffect(() => {
    if (!entity) return;
    async function loadInsights() {
      const params = new URLSearchParams({ instanceId: entity!.instanceId });
      const res = await fetch(
        `/api/insights/entity/${encodeURIComponent(entity!.entityId)}?${params}`
      );
      if (res.ok) {
        const data = await res.json();
        setEntityInsights(data.insights);
      }
    }
    loadInsights();
  }, [entity]);

  async function handleInsightStatus(insightId: string, status: Insight["status"]) {
    const res = await fetch("/api/insights", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: insightId, status }),
    });
    if (res.ok) {
      setEntityInsights((prev) =>
        prev.map((i) => (i.id === insightId ? { ...i, status } : i))
      );
    }
  }

  async function toggleTracked() {
    if (!entity) return;
    try {
      const res = await fetch("/api/entities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entity.id, isTracked: !entity.isTracked }),
      });
      if (res.ok) {
        setEntity((prev) => (prev ? { ...prev, isTracked: !prev.isTracked } : null));
        toast("success", entity.isTracked ? "Entity untracked" : "Entity is now tracked");
      } else {
        toast("error", "Failed to update tracking status");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading entity…</p>;
  }

  if (!entity) {
    return (
      <div className="space-y-4">
        <Link href="/entities" className="text-sm text-muted-foreground hover:underline">
          ← Back to entities
        </Link>
        <p>Entity not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/entities" className="text-sm text-muted-foreground hover:underline">
          ← Back to entities
        </Link>
        <Link href="/entities/graph" className="text-sm text-muted-foreground hover:underline">
          View entity graph
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {entity.friendlyName || entity.entityId}
          </h1>
          <p className="text-sm text-muted-foreground font-mono">
            {entity.entityId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{entity.domain}</Badge>
          <Badge variant={entity.lastState === "on" || entity.lastState === "home" ? "default" : "secondary"}>
            {entity.lastState ?? "unknown"}
          </Badge>
          <Button
            variant={entity.isTracked ? "default" : "outline"}
            size="sm"
            onClick={toggleTracked}
          >
            {entity.isTracked ? "Tracked" : "Track"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Details grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Domain" value={entity.domain} />
        <DetailItem label="Platform" value={entity.platform ?? "—"} />
        <DetailItem label="Area" value={entity.areaId ?? "—"} />
        <DetailItem
          label="Last Changed"
          value={
            entity.lastChangedAt
              ? new Date(entity.lastChangedAt).toLocaleString()
              : "—"
          }
        />
      </div>

      {/* History chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">State History (24h)</CardTitle>
          <CardDescription>
            Live data pulled from Home Assistant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EntityHistoryChart data={history} domain={entity.domain} />
        </CardContent>
      </Card>

      {/* Daily stats with trend comparison */}
      {dailyStats.length > 0 && (
        <>
          {/* Time range selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Period:</span>
            {TIME_RANGES.map((d) => (
              <Button
                key={d}
                variant={days === d ? "default" : "outline"}
                size="sm"
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>

          {/* Delta comparison badges */}
          {currentPeriodStats && previousPeriodStats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <DeltaCard
                label="Daily State Changes"
                current={currentPeriodStats.avgDailyChanges}
                previous={previousPeriodStats.avgDailyChanges}
              />
              <DeltaCard
                label="Daily Active Time"
                current={currentPeriodStats.avgDailyActiveTime}
                previous={previousPeriodStats.avgDailyActiveTime}
                format={formatDuration}
              />
              <DeltaCard
                label="Total State Changes"
                current={currentPeriodStats.totalStateChanges}
                previous={previousPeriodStats.totalStateChanges}
              />
              <DeltaCard
                label="Total Active Time"
                current={currentPeriodStats.totalActiveTime}
                previous={previousPeriodStats.totalActiveTime}
                format={formatDuration}
              />
            </div>
          )}

          {/* Charts */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">State Changes</CardTitle>
                <CardDescription>
                  Current vs previous {days}-day period
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DailyStatsChart data={dailyStats} metric="stateChanges" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Active Time</CardTitle>
                <CardDescription>
                  Hours per day the entity was active
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DailyStatsChart data={dailyStats} metric="activeTime" />
              </CardContent>
            </Card>
          </div>

          {/* Stats table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Statistics</CardTitle>
              <CardDescription>
                Aggregated from tracked history data
              </CardDescription>
            </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium">Date</th>
                    <th className="px-4 py-2 font-medium">State Changes</th>
                    <th className="px-4 py-2 font-medium">Active Time</th>
                    {entity.domain === "sensor" && (
                      <>
                        <th className="px-4 py-2 font-medium">Avg</th>
                        <th className="px-4 py-2 font-medium">Min</th>
                        <th className="px-4 py-2 font-medium">Max</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dailyStats.map((stat) => (
                    <tr key={stat.id} className="border-b last:border-0">
                      <td className="px-4 py-2">{stat.date}</td>
                      <td className="px-4 py-2">{stat.stateChanges}</td>
                      <td className="px-4 py-2">
                        {formatDuration(stat.activeTime)}
                      </td>
                      {entity.domain === "sensor" && (
                        <>
                          <td className="px-4 py-2">{stat.avgValue ?? "—"}</td>
                          <td className="px-4 py-2">{stat.minValue ?? "—"}</td>
                          <td className="px-4 py-2">{stat.maxValue ?? "—"}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
          </Card>
        </>
      )}

      {/* Inline Insights */}
      {entityInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">AI Insights</CardTitle>
            <CardDescription>
              Insights related to this entity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {entityInsights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onStatusChange={handleInsightStatus}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Attributes */}
      {entity.attributes && Object.keys(entity.attributes).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Attributes</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 sm:grid-cols-2 text-sm">
              {Object.entries(entity.attributes).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <dt className="font-medium text-muted-foreground min-w-[140px]">
                    {key}
                  </dt>
                  <dd className="break-all">
                    {typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function DeltaCard({
  label,
  current,
  previous,
  format,
}: {
  label: string;
  current: number;
  previous: number;
  format?: (n: number) => string;
}) {
  const delta = previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const isUp = delta > 0;
  const isDown = delta < 0;
  const fmt = format ?? ((n: number) => String(n));

  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-baseline gap-2 mt-1">
          <span className="text-xl font-bold">{fmt(current)}</span>
          {previous > 0 && (
            <span
              className={`text-xs font-medium ${
                isUp
                  ? "text-orange-500"
                  : isDown
                    ? "text-blue-500"
                    : "text-muted-foreground"
              }`}
            >
              {isUp ? "▲" : isDown ? "▼" : "—"}{" "}
              {Math.abs(delta).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          prev: {fmt(previous)}
        </p>
      </CardContent>
    </Card>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}
