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
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  TrendingUp,
  ArrowLeft,
  Search,
  Clock,
  Activity,
  Gauge,
  Loader2,
  Calendar,
  X,
} from "lucide-react";

interface TopEntity {
  id: string;
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

interface DailyStatDetail {
  date: string;
  stateChanges: number;
  activeTime: number;
  avgValue: string | null;
  stateDistribution: Record<string, number> | null;
}

interface HistoryEntry {
  state: string;
  last_changed: string;
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
  const [domainFilter, setDomainFilter] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<Set<string>>(new Set());
  const [areaFilter, setAreaFilter] = useState<Set<string>>(new Set());
  const [platformFilter, setPlatformFilter] = useState<Set<string>>(new Set());
  const [selectedEntity, setSelectedEntity] = useState<TopEntity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dailyDetails, setDailyDetails] = useState<DailyStatDetail[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

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

  async function openDetail(entity: TopEntity) {
    setSelectedEntity(entity);
    setDetailLoading(true);
    setDailyDetails([]);
    setHistoryEntries([]);

    try {
      // Fetch per-day breakdown from our DB
      const detailRes = await fetch(
        `/api/dashboard/top-entities/detail?entityId=${entity.id}&days=${days}`
      );
      if (detailRes.ok) {
        const data = await detailRes.json();
        setDailyDetails(data.dailyStats);
      }

      // Fetch recent history from HA (last 24h sample)
      if (selectedInstance) {
        const start = new Date();
        start.setDate(start.getDate() - 1);
        const params = new URLSearchParams({
          instanceId: selectedInstance,
          start: start.toISOString(),
          entityIds: entity.entityId,
        });
        const histRes = await fetch(`/api/ha/history?${params}`);
        if (histRes.ok) {
          const histData: HistoryEntry[][] = await histRes.json();
          setHistoryEntries(histData[0] ?? []);
        }
      }
    } finally {
      setDetailLoading(false);
    }
  }

  // Derive filter options from loaded data
  const domains = [...new Set(entities.map((e) => e.domain))].sort();
  const states = [...new Set(entities.map((e) => e.lastState).filter(Boolean) as string[])].sort();
  const areas = [...new Set(entities.map((e) => e.areaId).filter(Boolean) as string[])].sort();
  const platforms = [...new Set(entities.map((e) => e.platform).filter(Boolean) as string[])].sort();

  const filtered = entities.filter((e) => {
    const q = search.toLowerCase();
    if (q && !(e.friendlyName?.toLowerCase().includes(q)) && !e.entityId.toLowerCase().includes(q) && !e.domain.toLowerCase().includes(q)) return false;
    if (domainFilter.size > 0 && !domainFilter.has(e.domain)) return false;
    if (stateFilter.size > 0 && (!e.lastState || !stateFilter.has(e.lastState))) return false;
    if (areaFilter.size > 0 && (!e.areaId || !areaFilter.has(e.areaId))) return false;
    if (platformFilter.size > 0 && (!e.platform || !platformFilter.has(e.platform))) return false;
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center gap-3">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" /> Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gradient">
            Most Active Entities
          </h1>
          <p className="text-xs text-muted-foreground">
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

      {/* Filters */}
      {!loading && entities.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {domains.length > 1 && (
            <MultiSelect
              label="Domain"
              options={domains}
              selected={domainFilter}
              onChange={setDomainFilter}
            />
          )}
          {states.length > 1 && (
            <MultiSelect
              label="State"
              options={states}
              selected={stateFilter}
              onChange={setStateFilter}
            />
          )}
          {areas.length > 1 && (
            <MultiSelect
              label="Area"
              options={areas}
              selected={areaFilter}
              onChange={setAreaFilter}
            />
          )}
          {platforms.length > 1 && (
            <MultiSelect
              label="Platform"
              options={platforms}
              selected={platformFilter}
              onChange={setPlatformFilter}
            />
          )}
          {(domainFilter.size > 0 || stateFilter.size > 0 || areaFilter.size > 0 || platformFilter.size > 0) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDomainFilter(new Set()); setStateFilter(new Set()); setAreaFilter(new Set()); setPlatformFilter(new Set()); }}
              className="text-xs text-muted-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear all
            </Button>
          )}
        </div>
      )}

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
        <div className="space-y-2">
          {filtered.map((entity, i) => (
            <Card
              key={entity.entityId}
              className="overflow-hidden transition-colors hover:border-primary/30 cursor-pointer"
              onClick={() => openDetail(entity)}
            >
              <div className="flex items-start gap-3 p-3">
                {/* Rank */}
                <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {i + 1}
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0 space-y-1.5">
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
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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

      {/* State Changes Detail Modal */}
      <Dialog
        open={selectedEntity !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEntity(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedEntity && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  {selectedEntity.friendlyName || selectedEntity.entityId}
                </DialogTitle>
                <DialogDescription>
                  {selectedEntity.totalChanges.toLocaleString()} state changes over {days} days &mdash;{" "}
                  <span className="font-mono text-xs">{selectedEntity.entityId}</span>
                </DialogDescription>
              </DialogHeader>

              {detailLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Per-day breakdown */}
                  {dailyDetails.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Daily Breakdown
                      </h3>
                      <div className="rounded-lg border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-left">
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Changes</th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Active Time</th>
                              <th className="px-3 py-2 text-xs font-medium text-muted-foreground">States</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyDetails.map((day) => (
                              <tr key={day.date} className="border-b border-border/20 last:border-0">
                                <td className="px-3 py-2 font-mono text-xs">
                                  {new Date(day.date + "T00:00:00").toLocaleDateString(undefined, {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </td>
                                <td className="px-3 py-2 text-right font-medium">
                                  {day.stateChanges}
                                </td>
                                <td className="px-3 py-2 text-right text-muted-foreground">
                                  {formatDuration(day.activeTime)}
                                </td>
                                <td className="px-3 py-2">
                                  {day.stateDistribution ? (
                                    <div className="flex flex-wrap gap-1">
                                      {Object.entries(day.stateDistribution)
                                        .sort(([, a], [, b]) => (b as number) - (a as number))
                                        .slice(0, 4)
                                        .map(([state, seconds]) => (
                                          <Badge key={state} variant="outline" className="text-[10px] px-1.5 py-0">
                                            {state}: {formatDuration(seconds as number)}
                                          </Badge>
                                        ))}
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">&mdash;</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Recent state changes from HA history (last 24h) */}
                  {historyEntries.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Recent State Changes (last 24h)
                      </h3>
                      <div className="rounded-lg border divide-y divide-border/30 max-h-64 overflow-y-auto">
                        {historyEntries
                          .filter((_, i, arr) => i === 0 || arr[i].state !== arr[i - 1].state)
                          .slice(0, 50)
                          .map((entry, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between px-3 py-2 text-sm"
                            >
                              <Badge variant="secondary" className="font-mono text-xs">
                                {entry.state}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {new Date(entry.last_changed).toLocaleString(undefined, {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  second: "2-digit",
                                  hour12: true,
                                })}
                              </span>
                            </div>
                          ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        Showing unique transitions (duplicates filtered)
                      </p>
                    </div>
                  )}

                  {dailyDetails.length === 0 && historyEntries.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No detailed data available for this entity yet.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
