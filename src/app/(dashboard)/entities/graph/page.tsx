"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EntityGraph } from "@/components/charts/entity-graph";

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

interface GraphNode {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
  deviceId: string | null;
  lastState: string | null;
  activity: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation" | "device" | "area";
  label?: string;
}

export default function EntityGraphPage() {
  const router = useRouter();
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [allAreas, setAllAreas] = useState<string[]>([]);
  const [allDomains, setAllDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(
    new Set()
  );
  const [selectedAreas, setSelectedAreas] = useState<Set<string>>(new Set());
  const [edgeTypes, setEdgeTypes] = useState<Set<string>>(
    new Set(["automation", "correlation", "device", "area"])
  );
  const [hideIsolated, setHideIsolated] = useState(false);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadGraph = useCallback(async (instanceId: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/entities/graph?instanceId=${instanceId}`
      );
      if (res.ok) {
        const data = await res.json();
        setNodes(data.nodes);
        setEdges(data.edges);
        setAllAreas(data.areas ?? []);
        setAllDomains(data.domains ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInstance) loadGraph(selectedInstance);
  }, [selectedInstance, loadGraph]);

  // Apply client-side filters
  const filteredEdges = useMemo(() => {
    return edges.filter((e) => edgeTypes.has(e.type));
  }, [edges, edgeTypes]);

  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (selectedDomains.size > 0) {
      result = result.filter((n) => selectedDomains.has(n.domain));
    }
    if (selectedAreas.size > 0) {
      result = result.filter(
        (n) => n.areaId && selectedAreas.has(n.areaId)
      );
    }
    if (hideIsolated) {
      const connectedIds = new Set<string>();
      for (const e of filteredEdges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
      result = result.filter((n) => connectedIds.has(n.entityId));
    }
    return result;
  }, [nodes, selectedDomains, selectedAreas, hideIsolated, filteredEdges]);

  // Stats
  const stats = useMemo(() => {
    const edgesByType: Record<string, number> = {};
    for (const e of filteredEdges) {
      edgesByType[e.type] = (edgesByType[e.type] ?? 0) + 1;
    }
    const uniqueAreas = new Set(
      filteredNodes.map((n) => n.areaId).filter(Boolean)
    );
    const activeNodes = filteredNodes.filter((n) => n.activity > 0).length;
    return { edgesByType, uniqueAreas: uniqueAreas.size, activeNodes };
  }, [filteredNodes, filteredEdges]);

  function handleNodeClick(entityId: string) {
    const node = nodes.find((n) => n.entityId === entityId);
    if (node) {
      router.push(`/entities/${node.id}`);
    }
  }

  function toggleDomain(domain: string) {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleArea(area: string) {
    setSelectedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });
  }

  function toggleEdgeType(type: string) {
    setEdgeTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient">
            Entity Relationship Graph
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualize how entities are connected via automations, devices, areas,
            and AI-detected correlations
          </p>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
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
          <Link
            href="/entities"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Entity List
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">Show edges:</span>
              {(["automation", "correlation", "device", "area"] as const).map(
                (type) => (
                  <button
                    key={type}
                    onClick={() => toggleEdgeType(type)}
                    className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
                      edgeTypes.has(type)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {type}
                  </button>
                )
              )}
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hideIsolated}
                onChange={(e) => setHideIsolated(e.target.checked)}
                className="rounded"
              />
              <span className="text-xs text-muted-foreground">
                Hide isolated nodes
              </span>
            </label>
          </div>

          {allDomains.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground font-medium text-xs">
                Domains:
              </span>
              {allDomains.map((d) => (
                <button
                  key={d}
                  onClick={() => toggleDomain(d)}
                  className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
                    selectedDomains.size === 0 || selectedDomains.has(d)
                      ? "bg-secondary text-secondary-foreground border-border"
                      : "bg-muted/50 text-muted-foreground/50 border-transparent"
                  }`}
                >
                  {d}
                </button>
              ))}
              {selectedDomains.size > 0 && (
                <button
                  onClick={() => setSelectedDomains(new Set())}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  clear
                </button>
              )}
            </div>
          )}

          {allAreas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground font-medium text-xs">
                Areas:
              </span>
              {allAreas.map((a) => (
                <button
                  key={a}
                  onClick={() => toggleArea(a)}
                  className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
                    selectedAreas.size === 0 || selectedAreas.has(a)
                      ? "bg-secondary text-secondary-foreground border-border"
                      : "bg-muted/50 text-muted-foreground/50 border-transparent"
                  }`}
                >
                  {a}
                </button>
              ))}
              {selectedAreas.size > 0 && (
                <button
                  onClick={() => setSelectedAreas(new Set())}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  clear
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="h-[600px] bg-muted rounded-xl animate-pulse" />
      ) : (
        <EntityGraph
          nodes={filteredNodes}
          edges={filteredEdges}
          onNodeClick={handleNodeClick}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>Graph statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Entities:</span>{" "}
              <span className="font-medium">{filteredNodes.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Active:</span>{" "}
              <span className="font-medium">{stats.activeNodes}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Areas:</span>{" "}
              <span className="font-medium">{stats.uniqueAreas}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Connections:</span>{" "}
              <span className="font-medium">{filteredEdges.length}</span>
            </div>
            {Object.entries(stats.edgesByType).map(([type, count]) => (
              <div key={type}>
                <span className="text-muted-foreground capitalize">{type}:</span>{" "}
                <span className="font-medium">{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
