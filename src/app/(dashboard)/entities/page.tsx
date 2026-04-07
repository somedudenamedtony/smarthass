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
import { Cpu, Search, Eye, EyeOff, AlertCircle } from "lucide-react";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Entity {
  id: string;
  entityId: string;
  domain: string;
  friendlyName: string | null;
  areaId: string | null;
  lastState: string | null;
  lastChangedAt: string | null;
  isTracked: boolean;
  stateDistribution: Record<string, number> | null;
}

interface EntitiesResponse {
  entities: Entity[];
  domains: string[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface HAInstance {
  id: string;
  name: string;
}

export default function EntitiesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [data, setData] = useState<EntitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadEntities = useCallback(async () => {
    if (!selectedInstance) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        instanceId: selectedInstance,
        page: page.toString(),
      });
      if (domain) params.set("domain", domain);
      if (search) params.set("search", search);

      const res = await fetch(`/api/entities?${params}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load entities. Please try again.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [selectedInstance, page, domain, search]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  async function toggleTracked(entityId: string, current: boolean) {
    try {
      const res = await fetch("/api/entities", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entityId, isTracked: !current }),
      });
      if (res.ok) {
        toast("success", current ? "Entity untracked" : "Entity is now tracked");
        loadEntities();
      } else {
        toast("error", "Failed to update tracking status");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }

  if (instances.length === 0 && !loading) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">Entities</h1>
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Cpu className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No Home Assistant instances connected.{" "}
              <a href="/settings" className="text-primary hover:underline">Add one in Settings</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">Entities</h1>
        {instances.length > 1 && (
          <select
            className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
            value={selectedInstance ?? ""}
            onChange={(e) => {
              setSelectedInstance(e.target.value);
              setPage(1);
            }}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search entities…"
            className="pl-9 border-border/50"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        {data && (
          <select
            className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
            value={domain}
            onChange={(e) => { setDomain(e.target.value); setPage(1); }}
          >
            <option value="">All domains</option>
            {data.domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-lg animate-pulse" />)}</div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadEntities}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : !data || data.entities.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            {search || domain
              ? "No entities match your search. Try adjusting your filters."
              : "No entities found. Try syncing your instance first."}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{data.pagination.total} entities</CardTitle>
                  <CardDescription>Page {data.pagination.page} of {data.pagination.totalPages}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/30 text-left bg-muted/30">
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">Name</th>
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">Entity ID</th>
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">Domain</th>
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">State</th>
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">Last Changed</th>
                      <th className="px-4 py-2.5 font-medium text-xs text-muted-foreground uppercase tracking-wider">Tracked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entities.map((entity) => (
                      <tr
                        key={entity.id}
                        className="border-b border-border/20 last:border-0 hover:bg-accent/20 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/entities/${entity.id}`}
                            className="font-medium text-foreground hover:text-primary transition-colors"
                          >
                            {entity.friendlyName || entity.entityId}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                          {entity.entityId}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="border-border/30 text-xs">{entity.domain}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {entity.lastState ?? "—"}
                            </Badge>
                            {entity.stateDistribution && (() => {
                              const totalSecs = Object.values(entity.stateDistribution).reduce((a, b) => a + b, 0);
                              if (totalSecs === 0) return null;
                              const sorted = Object.entries(entity.stateDistribution)
                                .sort(([, a], [, b]) => b - a);
                              return sorted.map(([state, secs]) => {
                                const pct = Math.round((secs / totalSecs) * 100);
                                if (pct < 1) return null;
                                return (
                                  <span
                                    key={state}
                                    className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground"
                                    title={`${state}: ${pct}% of last 7 days`}
                                  >
                                    {state} {pct}%
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {entity.lastChangedAt
                            ? new Date(entity.lastChangedAt).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant={entity.isTracked ? "default" : "outline"}
                            size="sm"
                            className={`h-7 text-xs ${entity.isTracked ? "glow-sm" : "border-border/30"}`}
                            onClick={() => toggleTracked(entity.id, entity.isTracked)}
                          >
                            {entity.isTracked ? <><Eye className="h-3 w-3 mr-1" /> Tracked</> : <><EyeOff className="h-3 w-3 mr-1" /> Track</>}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-border/50">
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                {page} / {data.pagination.totalPages}
              </span>
              <Button variant="outline" size="sm" disabled={page >= data.pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="border-border/50">
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
