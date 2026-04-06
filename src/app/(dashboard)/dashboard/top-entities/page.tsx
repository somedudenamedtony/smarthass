"use client";

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  ArrowLeft,
  Search,
  Clock,
  Activity,
  Gauge,
} from "lucide-react";

interface TopEntity {
  entityId: string;
  friendlyName: string | null;
  domain: string;
  platform: string | null;
  areaId: string | null;
  lastState: string | null;
  lastChangedAt: string | null;
  totalChanges: number;
  totalActiveTime: number;
  avgValue: string | null;
  minValue: string | null;
  maxValue: string | null;
  daysWithData: number;
}

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function TopEntitiesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [entities, setEntities] = useState<TopEntity[]>([]);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

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

  const loadData = useCallback(
    async (instanceId: string, d: number) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/dashboard/top-entities?instanceId=${instanceId}&days=${d}`
        );
        if (res.ok) {
          const data = await res.json();
          setEntities(data.entities);
        }
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedInstance) {
      loadData(selectedInstance, days);
    }
  }, [selectedInstance, days, loadData]);

  const filtered = entities.filter((e) => {
    const q = search.toLowerCase();
    return (
      !q ||
      (e.friendlyName?.toLowerCase().includes(q)) ||
      e.entityId.toLowerCase().includes(q) ||
      e.domain.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient">
            Most Active Entities
          </h1>
          <p className="text-sm text-muted-foreground">
            All tracked entities ranked by state changes
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          {[7, 14, 30].map((d) => (
            <Button
              key={d}
              variant={days === d ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(d)}
              className={days === d ? "glow-sm" : ""}
            >
              {d}d
            </Button>
          ))}
        </div>
        {instances.length > 1 && (
          <select
            className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm focus:ring-2 focus:ring-primary/30 transition-shadow"
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

      {loading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {search
                ? "No entities match your search."
                : "No activity data yet. Sync your Home Assistant instance to start collecting stats."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((entity, i) => (
            <Card
              key={entity.entityId}
              className="overflow-hidden transition-colors hover:border-primary/30"
            >
              <div className="flex items-start gap-4 p-4">
                {/* Rank */}
                <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                  {i + 1}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">
                        {entity.friendlyName || entity.entityId}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {entity.entityId}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {entity.domain}
                      </Badge>
                      {entity.lastState && (
                        <Badge variant="secondary" className="text-xs font-mono">
                          {entity.lastState}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Activity className="h-3.5 w-3.5 text-primary" />
                      <span className="font-medium text-foreground">
                        {entity.totalChanges.toLocaleString()}
                      </span>{" "}
                      state changes
                    </div>

                    {entity.totalActiveTime > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-chart-2" />
                        <span className="font-medium text-foreground">
                          {formatDuration(entity.totalActiveTime)}
                        </span>{" "}
                        active time
                      </div>
                    )}

                    {entity.avgValue != null && (
                      <div className="flex items-center gap-1.5">
                        <Gauge className="h-3.5 w-3.5 text-chart-3" />
                        avg{" "}
                        <span className="font-medium text-foreground">
                          {entity.avgValue}
                        </span>
                        {entity.minValue != null &&
                          entity.maxValue != null && (
                            <span>
                              (min {entity.minValue} / max {entity.maxValue})
                            </span>
                          )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5">
                      <TrendingUp className="h-3.5 w-3.5 text-chart-4" />
                      <span className="font-medium text-foreground">
                        {entity.daysWithData}
                      </span>{" "}
                      days with data
                    </div>

                    {entity.areaId && (
                      <span className="text-muted-foreground">
                        Area: {entity.areaId}
                      </span>
                    )}

                    {entity.platform && (
                      <span className="text-muted-foreground">
                        Platform: {entity.platform}
                      </span>
                    )}
                  </div>

                  {/* Activity bar */}
                  {entities[0]?.totalChanges > 0 && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full transition-all"
                        style={{
                          width: `${Math.max(
                            (entity.totalChanges / entities[0].totalChanges) *
                              100,
                            2
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center pb-4">
        Showing {filtered.length} of {entities.length} tracked entities
      </p>
    </div>
  );
}
