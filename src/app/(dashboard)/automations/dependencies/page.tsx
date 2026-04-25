"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  GitBranch,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Link2,
  Unlink,
  ChevronDown,
  ChevronUp,
  Bot,
} from "lucide-react";

interface HAInstance {
  id: string;
  name: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: "automation" | "entity" | "trigger" | "service";
  domain?: string;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "triggers" | "uses" | "acts_on" | "calls_service";
}

interface Conflict {
  entityId: string;
  automations: string[];
  description: string;
}

interface Chain {
  path: string[];
  description: string;
}

interface OrphanRef {
  automationId: string;
  entityId: string;
}

interface DepGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  conflicts: Conflict[];
  chains: Chain[];
  orphanRefs: OrphanRef[];
}

interface AIAnalysis {
  summary: string;
  issues: Array<{ severity: string; title: string; description: string }>;
  recommendations: string[];
}

export default function DependenciesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [graph, setGraph] = useState<DepGraph | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [showConflicts, setShowConflicts] = useState(true);
  const [showChains, setShowChains] = useState(true);
  const [showOrphans, setShowOrphans] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadGraph = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      const res = await fetch(`/api/automations/dependencies?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setGraph(data);
      }
    } catch (err) {
      console.error("Failed to load dependencies:", err);
    }
    setLoading(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) loadGraph();
  }, [selectedInstance, loadGraph]);

  // Simple canvas graph rendering
  useEffect(() => {
    if (!graph || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Layout nodes in a force-directed-like arrangement (simple grid for now)
    const automationNodes = graph.nodes.filter((n) => n.type === "automation");
    const entityNodes = graph.nodes.filter((n) => n.type === "entity");

    const positions = new Map<string, { x: number; y: number }>();

    // Place automations on the left
    automationNodes.forEach((n, i) => {
      positions.set(n.id, {
        x: 120,
        y: 40 + i * (Math.min(60, (height - 80) / Math.max(automationNodes.length, 1))),
      });
    });

    // Place entities on the right
    entityNodes.forEach((n, i) => {
      positions.set(n.id, {
        x: width - 120,
        y: 40 + i * (Math.min(40, (height - 80) / Math.max(entityNodes.length, 1))),
      });
    });

    // Clear
    ctx.clearRect(0, 0, width, height);

    // Draw edges
    graph.edges.forEach((edge) => {
      const from = positions.get(edge.source);
      const to = positions.get(edge.target);
      if (!from || !to) return;

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.strokeStyle =
        edge.type === "triggers" ? "rgba(59, 130, 246, 0.3)" :
        edge.type === "acts_on" ? "rgba(239, 68, 68, 0.3)" :
        "rgba(156, 163, 175, 0.2)";
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Draw nodes
    graph.nodes.forEach((node) => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const isConflict = graph.conflicts.some((c) => c.entityId === node.id || c.automations.includes(node.id));

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, node.type === "automation" ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle =
        isConflict ? "#ef4444" :
        node.type === "automation" ? "#3b82f6" :
        "#6b7280";
      ctx.fill();

      // Label
      ctx.font = "10px sans-serif";
      ctx.fillStyle = "#9ca3af";
      ctx.textAlign = node.type === "automation" ? "right" : "left";
      const label = node.label.length > 25 ? node.label.slice(0, 22) + "…" : node.label;
      ctx.fillText(label, pos.x + (node.type === "automation" ? -12 : 12), pos.y + 3);
    });
  }, [graph]);

  async function runAIAnalysis() {
    if (!selectedInstance) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/automations/dependencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysis(data);
      }
    } catch (err) {
      console.error("AI analysis failed:", err);
    }
    setAnalyzing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" />
            Automation Dependencies
          </h1>
          <p className="text-muted-foreground">Visualize entity relationships and detect conflicts</p>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              value={selectedInstance || ""}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={() => { setLoading(true); loadGraph(); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats */}
      {graph && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{graph.nodes.filter((n) => n.type === "automation").length}</div>
              <p className="text-sm text-muted-foreground">Automations</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{graph.edges.length}</div>
              <p className="text-sm text-muted-foreground">Connections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className={`text-3xl font-bold ${graph.conflicts.length > 0 ? "text-destructive" : ""}`}>
                {graph.conflicts.length}
              </div>
              <p className="text-sm text-muted-foreground">Conflicts</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{graph.chains.length}</div>
              <p className="text-sm text-muted-foreground">Chains</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Graph Canvas */}
      {graph && graph.nodes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Dependency Graph</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative bg-muted/30 rounded-lg overflow-hidden" style={{ height: Math.min(600, Math.max(300, graph.nodes.length * 20 + 80)) }}>
              <canvas
                ref={canvasRef}
                className="w-full h-full"
                style={{ width: "100%", height: "100%" }}
              />
              <div className="absolute bottom-2 right-2 flex gap-3 text-xs text-muted-foreground bg-background/80 rounded-lg px-3 py-1.5">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Automation
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-gray-500" /> Entity
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Conflict
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conflicts */}
      {graph && graph.conflicts.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowConflicts(!showConflicts)}>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Conflicts ({graph.conflicts.length})
              </span>
              {showConflicts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {showConflicts && (
            <CardContent className="space-y-3">
              {graph.conflicts.map((c, i) => (
                <div key={i} className="border rounded-lg p-3 bg-destructive/5">
                  <div className="flex items-start gap-2">
                    <Link2 className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{c.entityId}</p>
                      <p className="text-xs text-muted-foreground">{c.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {c.automations.map((a) => (
                          <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Chains */}
      {graph && graph.chains.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowChains(!showChains)}>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-blue-500" />
                Chains ({graph.chains.length})
              </span>
              {showChains ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {showChains && (
            <CardContent className="space-y-3">
              {graph.chains.map((chain, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{chain.description}</p>
                  <div className="flex items-center flex-wrap gap-1">
                    {chain.path.map((step, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <Badge variant="outline" className="text-xs">{step}</Badge>
                        {j < chain.path.length - 1 && <span className="text-muted-foreground">→</span>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* Orphan Refs */}
      {graph && graph.orphanRefs.length > 0 && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowOrphans(!showOrphans)}>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Unlink className="h-5 w-5 text-warning" />
                Orphan References ({graph.orphanRefs.length})
              </span>
              {showOrphans ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </CardTitle>
          </CardHeader>
          {showOrphans && (
            <CardContent className="space-y-2">
              {graph.orphanRefs.map((ref, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary" className="text-xs">{ref.automationId}</Badge>
                  <span className="text-muted-foreground">→</span>
                  <Badge variant="destructive" className="text-xs">{ref.entityId}</Badge>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* AI Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!analysis ? (
            <div className="text-center py-4">
              <p className="text-sm text-muted-foreground mb-3">Get AI-powered analysis of your automation dependencies</p>
              <Button onClick={runAIAnalysis} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  "Analyze with AI"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{analysis.summary}</p>
              {analysis.issues.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Issues</p>
                  {analysis.issues.map((issue, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={issue.severity === "critical" ? "destructive" : "secondary"} className="text-xs">
                          {issue.severity}
                        </Badge>
                        <span className="text-sm font-medium">{issue.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{issue.description}</p>
                    </div>
                  ))}
                </div>
              )}
              {analysis.recommendations.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Recommendations</p>
                  <ul className="space-y-1">
                    {analysis.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={runAIAnalysis} disabled={analyzing}>
                {analyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Re-analyze
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
