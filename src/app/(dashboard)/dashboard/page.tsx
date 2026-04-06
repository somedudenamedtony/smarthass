"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopEntitiesChart } from "@/components/charts/top-entities-chart";
import { DomainDistributionChart } from "@/components/charts/domain-distribution";

interface DashboardData {
  instance: {
    name: string;
    status: string;
    haVersion: string | null;
    lastSyncAt: string | null;
  };
  metrics: {
    totalEntities: number;
    activeAutomations: number;
    totalAutomations: number;
    trackedEntities: number;
    stateChangesToday: number;
  };
  topEntities: {
    entityId: string;
    friendlyName: string | null;
    domain: string;
    totalChanges: number;
  }[];
  domainDistribution: { domain: string; count: number }[];
  recentChanges: {
    entityId: string;
    friendlyName: string | null;
    domain: string;
    lastState: string | null;
    lastChangedAt: string | null;
  }[];
}

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

export default function DashboardPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) {
          setSelectedInstance(list[0].id);
        } else {
          setLoading(false);
        }
      });
  }, []);

  const loadDashboard = useCallback(async (instanceId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/stats?instanceId=${instanceId}`
      );
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInstance) {
      loadDashboard(selectedInstance);
    }
  }, [selectedInstance, loadDashboard]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading dashboard…</p>;
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Home Assistant instances connected.{" "}
            <a href="/settings" className="underline">
              Add one in Settings
            </a>{" "}
            to get started.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        {instances.length > 1 && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
            value={selectedInstance ?? ""}
            onChange={(e) => setSelectedInstance(e.target.value)}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {data && (
        <>
          {/* Instance health */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">{data.instance.name}</CardTitle>
              <Badge
                variant={
                  data.instance.status === "connected"
                    ? "default"
                    : "destructive"
                }
              >
                {data.instance.status}
              </Badge>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {data.instance.haVersion && (
                <span>HA {data.instance.haVersion}</span>
              )}
              {data.instance.lastSyncAt && (
                <span className="ml-4">
                  Last sync:{" "}
                  {new Date(data.instance.lastSyncAt).toLocaleString()}
                </span>
              )}
            </CardContent>
          </Card>

          {/* Key metrics */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Total Entities"
              value={data.metrics.totalEntities}
            />
            <MetricCard
              label="Active Automations"
              value={`${data.metrics.activeAutomations} / ${data.metrics.totalAutomations}`}
            />
            <MetricCard
              label="Tracked Entities"
              value={data.metrics.trackedEntities}
            />
            <MetricCard
              label="State Changes Today"
              value={data.metrics.stateChangesToday}
            />
          </div>

          {/* Charts row */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Most Active Entities (7 days)
                </CardTitle>
                <CardDescription>By total state changes</CardDescription>
              </CardHeader>
              <CardContent>
                <TopEntitiesChart data={data.topEntities} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Entity Distribution
                </CardTitle>
                <CardDescription>By domain</CardDescription>
              </CardHeader>
              <CardContent>
                <DomainDistributionChart data={data.domainDistribution} />
              </CardContent>
            </Card>
          </div>

          {/* Recent activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <CardDescription>Latest entity state changes</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No recent activity. Run a sync to populate entity data.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.recentChanges.map((e) => (
                    <div
                      key={e.entityId}
                      className="flex items-center justify-between border-b pb-2 last:border-0 text-sm"
                    >
                      <div>
                        <span className="font-medium">
                          {e.friendlyName || e.entityId}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {e.domain}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{e.lastState}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {e.lastChangedAt
                            ? new Date(e.lastChangedAt).toLocaleString()
                            : "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
