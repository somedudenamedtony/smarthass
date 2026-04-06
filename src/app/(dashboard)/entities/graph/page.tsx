"use client";

import { useCallback, useEffect, useState } from "react";
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
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation";
  label?: string;
}

export default function EntityGraphPage() {
  const router = useRouter();
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(true);

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
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInstance) loadGraph(selectedInstance);
  }, [selectedInstance, loadGraph]);

  function handleNodeClick(entityId: string) {
    // Find internal ID by entityId (HA entity id)
    const node = nodes.find((n) => n.entityId === entityId);
    if (node) {
      router.push(`/entities/${node.id}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient">
            Entity Relationship Graph
          </h1>
          <p className="text-sm text-muted-foreground">
            Visualize how entities are connected via automations and AI-detected
            correlations
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

      {loading ? (
        <div className="h-[600px] bg-muted rounded-xl animate-pulse" />
      ) : (
        <EntityGraph
          nodes={nodes}
          edges={edges}
          onNodeClick={handleNodeClick}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
          <CardDescription>Graph statistics</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-8 text-sm">
            <div>
              <span className="text-muted-foreground">Entities:</span>{" "}
              <span className="font-medium">{nodes.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Connections:</span>{" "}
              <span className="font-medium">{edges.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Automation links:</span>{" "}
              <span className="font-medium">
                {edges.filter((e) => e.type === "automation").length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Correlations:</span>{" "}
              <span className="font-medium">
                {edges.filter((e) => e.type === "correlation").length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
