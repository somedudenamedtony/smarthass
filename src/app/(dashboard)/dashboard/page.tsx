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
import { InsightCard, type Insight } from "@/components/insights/insight-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  GitBranch,
  Lightbulb,
  Loader2,
  RefreshCw,
  Sparkles,
  Wifi,
  WifiOff,
  XCircle,
  Zap,
} from "lucide-react";
import { useToast } from "@/components/toast";

// Keep this export — CustomizePanel imports it
export const WIDGET_LABELS: Record<string, string> = {};

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

const analysisCategoryLabels: Record<string, string> = {
  usage_patterns: "Usage Patterns",
  efficiency: "Efficiency",
  anomaly_detection: "Anomaly Detection",
  automation_gaps: "Automation Gaps",
  cross_device_correlation: "Cross-Device Correlation",
  device_suggestions: "Device Suggestions",
  automation_review: "Automation Review",
};

export default function DashboardPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Instance status
  const [instanceStatus, setInstanceStatus] = useState<{
    name: string;
    status: string;
    haVersion: string | null;
    lastSyncAt: string | null;
  } | null>(null);

  // Insights
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightCounts, setInsightCounts] = useState<Record<string, number>>({});
  const [newInsightCount, setNewInsightCount] = useState(0);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Sync + Analysis
  const [syncing, setSyncing] = useState(false);
  const [syncPhase, setSyncPhase] = useState<"idle" | "syncing" | "analyzing" | "done" | "error">("idle");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncStats, setSyncStats] = useState<{ entities: number; stats: number; automations: number } | null>(null);
  const [analysisResult, setAnalysisResult] = useState<{
    success: boolean;
    totalInsights?: number;
    results?: Record<string, number>;
    error?: string;
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [categoryProgress, setCategoryProgress] = useState<Record<string, { status: "pending" | "running" | "done" | "error"; count?: number }>>({});

  // Load instances
  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else { setLoading(false); setInsightsLoading(false); }
      });
  }, []);

  // Load instance status
  const loadStatus = useCallback(async (instanceId: string) => {
    try {
      const res = await fetch(`/api/dashboard/stats?instanceId=${instanceId}&topLimit=1`);
      if (res.ok) {
        const data = await res.json();
        setInstanceStatus(data.instance);
      }
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  // Load insights
  const loadInsights = useCallback(async () => {
    if (!selectedInstance) return;
    setInsightsLoading(true);
    try {
      const res = await fetch(`/api/insights?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights ?? []);
        setInsightCounts(data.counts ?? {});
        setNewInsightCount(data.newCount ?? 0);
      }
    } catch { /* non-critical */ }
    setInsightsLoading(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) {
      loadStatus(selectedInstance);
      loadInsights();
    }
  }, [selectedInstance, loadStatus, loadInsights]);

  // Sync + Analyze: single button that does both
  const handleSyncAndAnalyze = useCallback(async () => {
    if (!selectedInstance || syncing) return;
    setSyncing(true);
    setSyncPhase("syncing");
    setSyncStats(null);
    setAnalysisResult(null);
    setSyncError(null);
    setCategoryProgress({});
    setSyncDialogOpen(true);

    // Phase 1: Sync
    try {
      const syncRes = await fetch("/api/ha/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance }),
      });
      const syncData = await syncRes.json();
      if (!syncRes.ok) {
        setSyncPhase("error");
        setSyncError(syncData.error || "Sync failed");
        setSyncing(false);
        return;
      }
      setSyncStats({
        entities: syncData.entitiesSynced ?? 0,
        stats: syncData.statsSynced ?? 0,
        automations: syncData.automationsSynced ?? 0,
      });
    } catch {
      setSyncPhase("error");
      setSyncError("Network error during sync.");
      setSyncing(false);
      return;
    }

    // Phase 2: AI Analysis via SSE
    setSyncPhase("analyzing");
    // Initialize all categories as pending
    const initialProgress: Record<string, { status: "pending" | "running" | "done" | "error"; count?: number }> = {};
    for (const key of Object.keys(analysisCategoryLabels)) {
      initialProgress[key] = { status: "pending" };
    }
    setCategoryProgress(initialProgress);

    // Map SSE step names to UI category keys
    const stepToCategories: Record<string, string[]> = {
      usage_efficiency: ["usage_patterns", "efficiency"],
      anomaly_detection: ["anomaly_detection"],
      automation_correlation: ["automation_gaps", "cross_device_correlation"],
      device_suggestions: ["device_suggestions"],
      automation_review: ["automation_review"],
    };

    try {
      const response = await fetch(
        `/api/analysis/stream?instanceId=${encodeURIComponent(selectedInstance)}`
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        setAnalysisResult({
          success: false,
          error: (errData as { error?: string }).error || `Analysis failed (${response.status})`,
        });
      } else if (!response.body) {
        setAnalysisResult({ success: false, error: "Streaming not supported." });
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Parse SSE events from buffer
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // Keep incomplete line in buffer

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ") && eventType) {
              try {
                const data = JSON.parse(line.slice(6));
                if (eventType === "progress") {
                  const categories = stepToCategories[data.step];
                  if (categories) {
                    setCategoryProgress((prev) => {
                      const next = { ...prev };
                      for (const cat of categories) {
                        next[cat] = {
                          status: data.status === "running" ? "running" : data.status === "done" ? "done" : "error",
                          count: data.count,
                        };
                      }
                      return next;
                    });
                  }
                } else if (eventType === "complete") {
                  setAnalysisResult({
                    success: true,
                    totalInsights: data.totalInsights,
                    results: data.results,
                  });
                } else if (eventType === "error") {
                  setAnalysisResult({ success: false, error: data.error || "Analysis failed" });
                }
              } catch { /* skip malformed JSON */ }
              eventType = "";
            } else if (line === "") {
              eventType = "";
            }
          }
        }

        // If we never got a complete/error event
      }
    } catch (err) {
      console.error("[sync] Analysis stream error:", err);
      setAnalysisResult({ success: false, error: "Network error during analysis." });
    }

    setSyncPhase("done");
    setSyncing(false);
    loadStatus(selectedInstance);
    loadInsights();
  }, [selectedInstance, syncing, loadStatus, loadInsights]);

  // Insight status change
  async function handleInsightStatusChange(id: string, status: Insight["status"]) {
    try {
      const res = await fetch("/api/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setInsights((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
        if (status === "viewed" || status === "dismissed") {
          setNewInsightCount((prev) => Math.max(0, prev - 1));
        }
        toast("success", status === "dismissed" ? "Insight dismissed" : "Insight updated");
      } else {
        toast("error", "Failed to update insight status");
      }
    } catch {
      toast("error", "Network error.");
    }
  }

  const totalInsights = Object.values(insightCounts).reduce((a, b) => a + b, 0);

  // --- Loading state ---
  if (loading && insightsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 w-64 bg-muted rounded" />
        <div className="grid gap-3 grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl" />)}
        </div>
      </div>
    );
  }

  // --- No instances ---
  if (instances.length === 0) {
    return (
      <div className="space-y-6 animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">SmartHass</h1>
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">
              No Home Assistant instances connected yet.
            </p>
            <Link href="/settings">
              <Button className="glow-sm">Connect Home Assistant</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gradient">SmartHass</h1>
          <div className="flex items-center gap-3 mt-1">
            {instanceStatus && (
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {instanceStatus.status === "connected" ? (
                  <Wifi className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-destructive" />
                )}
                {instanceStatus.name}
                {instanceStatus.haVersion && <span className="text-xs">({instanceStatus.haVersion})</span>}
              </span>
            )}
            {newInsightCount > 0 && (
              <Badge variant="default" className="glow-sm">{newInsightCount} new</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
              value={selectedInstance ?? ""}
              onChange={(e) => setSelectedInstance(e.target.value)}
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}
          <Button
            onClick={handleSyncAndAnalyze}
            disabled={syncing}
            className={syncing ? "" : "glow-sm"}
            size="lg"
          >
            {syncing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {syncPhase === "syncing" ? "Syncing…" : "Analyzing…"}
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Sync &amp; Analyze
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Insight summary cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total Insights" value={totalInsights} icon={<Brain className="h-4 w-4" />} color="primary" />
        <SummaryCard label="Patterns" value={insightCounts.insight ?? 0} icon={<Lightbulb className="h-4 w-4" />} color="chart-4" />
        <SummaryCard label="Anomalies" value={insightCounts.anomaly ?? 0} icon={<AlertTriangle className="h-4 w-4" />} color="destructive" />
        <SummaryCard label="Automations" value={(insightCounts.automation ?? 0) + (insightCounts.suggestion ?? 0)} icon={<Zap className="h-4 w-4" />} color="chart-2" />
        <SummaryCard label="Correlations" value={insightCounts.correlation ?? 0} icon={<GitBranch className="h-4 w-4" />} color="chart-3" />
        <SummaryCard label="Device Ideas" value={insightCounts.device_recommendation ?? 0} icon={<Cpu className="h-4 w-4" />} color="chart-5" />
      </div>

      {/* Insights feed */}
      {insightsLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
        </div>
      ) : insights.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-primary/30" />
            <h2 className="text-lg font-semibold mb-2">No insights yet</h2>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              Click <strong>Sync &amp; Analyze</strong> to pull your Home Assistant data and run AI analysis.
              SmartHass will find usage patterns, anomalies, automation opportunities, and more.
            </p>
            <Button onClick={handleSyncAndAnalyze} disabled={syncing} className="glow-sm" size="lg">
              <Sparkles className="h-4 w-4 mr-2" />
              Run First Analysis
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Recent Insights
            </h2>
            {totalInsights > 5 && (
              <Link href="/insights" className="text-sm text-primary hover:underline flex items-center gap-1">
                View all {totalInsights} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
          {insights.slice(0, 8).map((insight) => (
            <InsightCard key={insight.id} insight={insight} onStatusChange={handleInsightStatusChange} />
          ))}
          {totalInsights > 8 && (
            <Link href="/insights">
              <Button variant="outline" className="w-full border-border/50">
                View All {totalInsights} Insights
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          )}
        </div>
      )}

      {/* Sync + Analyze dialog */}
      <Dialog
        open={syncDialogOpen}
        onOpenChange={(open) => {
          if (!syncing) setSyncDialogOpen(open);
        }}
      >
        <DialogContent showCloseButton={!syncing} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {syncPhase === "syncing" && "Syncing Data…"}
              {syncPhase === "analyzing" && "Running AI Analysis…"}
              {syncPhase === "done" && (analysisResult?.success ? "Sync & Analysis Complete" : "Complete (with issues)")}
              {syncPhase === "error" && "Sync Failed"}
            </DialogTitle>
            <DialogDescription>
              {syncPhase === "syncing" && "Pulling latest data from Home Assistant…"}
              {syncPhase === "analyzing" && "AI is analyzing your smart home data across multiple categories…"}
              {syncPhase === "done" && analysisResult?.success && `Generated ${analysisResult.totalInsights ?? 0} new insight${(analysisResult.totalInsights ?? 0) === 1 ? "" : "s"}.`}
              {syncPhase === "done" && !analysisResult?.success && (analysisResult?.error ?? "Analysis encountered an issue.")}
              {syncPhase === "error" && (syncError ?? "An error occurred.")}
            </DialogDescription>
          </DialogHeader>

          {/* Sync phase */}
          {syncPhase === "syncing" && (
            <div className="flex items-center gap-3 py-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Fetching entities, states, and automations…</span>
            </div>
          )}

          {/* Analysis phase */}
          {syncPhase === "analyzing" && (
            <div className="space-y-3 py-2">
              {syncStats && (
                <div className="rounded-lg bg-primary/5 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Entities synced</span><span className="font-medium">{syncStats.entities}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Stats updated</span><span className="font-medium">{syncStats.stats}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Automations synced</span><span className="font-medium">{syncStats.automations}</span></div>
                </div>
              )}
              {Object.entries(analysisCategoryLabels).map(([key, label]) => {
                const progress = categoryProgress[key];
                const status = progress?.status ?? "pending";
                return (
                  <div key={key} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      {status === "running" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                      {status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
                      {status === "error" && <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                      {status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                      <span className={status === "pending" ? "text-muted-foreground/50" : "text-muted-foreground"}>{label}</span>
                    </div>
                    {status === "done" && progress?.count != null && (
                      <Badge variant="secondary">{progress.count}</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Done phase */}
          {syncPhase === "done" && (
            <div className="space-y-3 py-2">
              {syncStats && (
                <div className="rounded-lg bg-primary/5 p-3 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Entities synced</span><span className="font-medium">{syncStats.entities}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Stats updated</span><span className="font-medium">{syncStats.stats}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Automations synced</span><span className="font-medium">{syncStats.automations}</span></div>
                </div>
              )}
              {analysisResult?.success && Object.entries(analysisResult.results ?? {}).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>{analysisCategoryLabels[key] ?? key}</span>
                  </div>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {analysisResult && !analysisResult.success && (
                <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
                  <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <span>{analysisResult.error}</span>
                </div>
              )}
            </div>
          )}

          {/* Error phase */}
          {syncPhase === "error" && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span>{syncError}</span>
            </div>
          )}

          {!syncing && syncPhase !== "idle" && (
            <DialogFooter>
              <Button onClick={() => setSyncDialogOpen(false)}>
                {syncPhase === "done" && analysisResult?.success ? "Done" : "Close"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color = "primary",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, var(--color-${color}), transparent 70%)`,
          opacity: value > 0 ? 0.1 : 0.04,
        }}
      />
      <CardContent className="pt-3 pb-2.5 relative">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span style={{ color: `var(--color-${color})` }}>{icon}</span>
        </div>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
