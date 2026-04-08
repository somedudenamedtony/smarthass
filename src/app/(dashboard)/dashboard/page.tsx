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
import { TopEntitiesChart } from "@/components/charts/top-entities-chart";
import { DomainDistributionChart } from "@/components/charts/domain-distribution";
import { CustomizePanel } from "@/components/dashboard/customize-panel";
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
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Brain,
  CheckCircle2,
  Cpu,
  Eye,
  GitBranch,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
  XCircle,
  Zap,
  Settings2,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SyncDialog, type SyncResult } from "@/components/sync-dialog";

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
    stateChangesDate: string;
  };
  topEntities: {
    id: string;
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

interface DashboardPreferences {
  widgetOrder?: string[];
  hiddenWidgets?: string[];
  pinnedEntityIds?: string[];
}

const DEFAULT_WIDGET_ORDER = [
  "insights-overview",
  "instance-health",
  "key-metrics",
  "charts",
  "recent-activity",
];

export const WIDGET_LABELS: Record<string, string> = {
  "insights-overview": "AI Insights",
  "instance-health": "Instance Health",
  "key-metrics": "Key Metrics",
  "charts": "Charts",
  "recent-activity": "Recent Activity",
};

const analysisCategoryLabels: Record<string, string> = {
  usage_patterns: "Usage Patterns",
  anomaly_detection: "Anomaly Detection",
  automation_gaps: "Automation Gaps",
  efficiency: "Efficiency",
  cross_device_correlation: "Cross-Device Correlation",
  device_suggestions: "Device Suggestions",
};

export default function DashboardPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<DashboardPreferences>({});
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const { toast } = useToast();

  // Insights state
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightCounts, setInsightCounts] = useState<Record<string, number>>({});
  const [newInsightCount, setNewInsightCount] = useState(0);
  const [insightsLoading, setInsightsLoading] = useState(true);

  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    success: boolean;
    totalInsights?: number;
    results?: Record<string, number>;
    error?: string;
  } | null>(null);

  // Load preferences
  useEffect(() => {
    fetch("/api/dashboard/preferences")
      .then((r) => r.json())
      .then((d) => setPreferences(d.preferences ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) {
          setSelectedInstance(list[0].id);
        } else {
          setLoading(false);
          setInsightsLoading(false);
        }
      });
  }, []);

  const loadDashboard = useCallback(async (instanceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/stats?instanceId=${instanceId}&topLimit=50`
      );
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load dashboard data.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

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
    } catch {
      // Insights are non-critical
    }
    setInsightsLoading(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) {
      loadDashboard(selectedInstance);
      loadInsights();
    }
  }, [selectedInstance, loadDashboard, loadInsights]);

  const handleSync = useCallback(async () => {
    if (!selectedInstance || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncDialogOpen(true);
    try {
      const res = await fetch("/api/ha/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance }),
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult({
          success: true,
          entitiesSynced: data.entitiesSynced,
          statsSynced: data.statsSynced,
          automationsSynced: data.automationsSynced,
        });
        loadDashboard(selectedInstance);
      } else {
        setSyncResult({ success: false, error: data.error || "Sync failed" });
      }
    } catch {
      setSyncResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setSyncing(false);
    }
  }, [selectedInstance, syncing, loadDashboard]);

  async function analyzeNow() {
    if (!selectedInstance) return;
    setAnalyzing(true);
    setAnalysisResult(null);
    setAnalysisDialogOpen(true);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance }),
      });
      const data = await res.json();
      if (res.ok) {
        setAnalysisResult({ success: true, totalInsights: data.totalInsights, results: data.results });
        await loadInsights();
      } else {
        setAnalysisResult({ success: false, error: data.error || "Analysis failed" });
      }
    } catch {
      setAnalysisResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setAnalyzing(false);
    }
  }

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
      toast("error", "Network error. Please try again.");
    }
  }

  const savePreferences = useCallback(async (prefs: DashboardPreferences) => {
    setPreferences(prefs);
    try {
      const res = await fetch("/api/dashboard/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        toast("success", "Dashboard preferences saved");
      } else {
        toast("error", "Failed to save preferences");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }, [toast]);

  const widgetOrder = preferences.widgetOrder ?? DEFAULT_WIDGET_ORDER;
  const hiddenWidgets = new Set(preferences.hiddenWidgets ?? []);
  const totalInsights = Object.values(insightCounts).reduce((a, b) => a + b, 0);

  if (loading && insightsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-xl font-bold tracking-tight text-gradient">SmartHass</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => selectedInstance && loadDashboard(selectedInstance)}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-xl font-bold tracking-tight text-gradient">SmartHass</h1>
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No Home Assistant instances connected.{" "}
              <a href="/settings" className="text-primary hover:underline">
                Add one in Settings
              </a>{" "}
              to get started.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Widget renderers
  const widgets: Record<string, () => React.ReactNode> = {
    "insights-overview": () => (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <InsightSummaryCard label="Total" value={totalInsights} icon={<Brain className="h-4 w-4" />} color="primary" />
          <InsightSummaryCard label="Patterns" value={insightCounts.insight ?? 0} icon={<Lightbulb className="h-4 w-4" />} color="chart-4" />
          <InsightSummaryCard label="Anomalies" value={insightCounts.anomaly ?? 0} icon={<AlertTriangle className="h-4 w-4" />} color="destructive" />
          <InsightSummaryCard label="Automations" value={(insightCounts.automation ?? 0) + (insightCounts.suggestion ?? 0)} icon={<Zap className="h-4 w-4" />} color="chart-2" />
          <InsightSummaryCard label="Correlations" value={insightCounts.correlation ?? 0} icon={<GitBranch className="h-4 w-4" />} color="chart-3" />
          <InsightSummaryCard label="Device Ideas" value={insightCounts.device_recommendation ?? 0} icon={<Cpu className="h-4 w-4" />} color="chart-5" />
        </div>

        {insightsLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-28 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : insights.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Sparkles className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-muted-foreground mb-3">
                No insights yet. Run AI analysis to discover patterns, anomalies, and automation opportunities.
              </p>
              <Button onClick={analyzeNow} disabled={analyzing} className="glow-sm">
                <Sparkles className="h-4 w-4 mr-2" />
                Run First Analysis
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {insights.slice(0, 5).map((insight) => (
              <InsightCard key={insight.id} insight={insight} onStatusChange={handleInsightStatusChange} />
            ))}
            {totalInsights > 5 && (
              <Link href="/insights">
                <Button variant="outline" className="w-full border-border/50">
                  View All {totalInsights} Insights
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            )}
          </div>
        )}
      </div>
    ),

    "instance-health": () =>
      data && (
        <Card className="overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-chart-3/5 pointer-events-none" />
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 relative">
            <div className="flex items-center gap-3">
              {data.instance.status === "connected" ? (
                <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center glow-sm">
                  <Wifi className="h-4 w-4 text-primary" />
                </div>
              ) : (
                <div className="h-8 w-8 rounded-lg bg-destructive/15 flex items-center justify-center glow-destructive">
                  <WifiOff className="h-4 w-4 text-destructive" />
                </div>
              )}
              <div>
                <CardTitle className="text-base">{data.instance.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {data.instance.haVersion && `HA ${data.instance.haVersion}`}
                  {data.instance.lastSyncAt && (
                    <span className="ml-3">
                      Synced {new Date(data.instance.lastSyncAt).toLocaleString()}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <Badge
              variant={
                data.instance.status === "connected"
                  ? "default"
                  : "destructive"
              }
              className={data.instance.status === "connected" ? "glow-sm" : "glow-destructive"}
            >
              {data.instance.status}
            </Badge>
          </CardHeader>
        </Card>
      ),

    "key-metrics": () =>
      data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Entities"
            value={data.metrics.totalEntities}
            icon={<Cpu className="h-4 w-4" />}
            color="primary"
          />
          <MetricCard
            label="Active Automations"
            value={`${data.metrics.activeAutomations} / ${data.metrics.totalAutomations}`}
            icon={<Zap className="h-4 w-4" />}
            color="chart-2"
          />
          <MetricCard
            label="Tracked Entities"
            value={data.metrics.trackedEntities}
            icon={<Eye className="h-4 w-4" />}
            color="chart-3"
          />
          <MetricCard
            label={data.metrics.stateChangesDate === new Date().toISOString().split("T")[0]
              ? "State Changes Today"
              : `State Changes (${new Date(data.metrics.stateChangesDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })})`
            }
            value={data.metrics.stateChangesToday.toLocaleString()}
            icon={<Activity className="h-4 w-4" />}
            color="chart-4"
          />
        </div>
      ),

    charts: () =>
      data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Link href="/dashboard/top-entities">
            <Card className="overflow-hidden cursor-pointer transition-colors hover:border-primary/40">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Most Active Entities
                  </CardTitle>
                  <span className="text-xs text-muted-foreground">
                    View all &rarr;
                  </span>
                </div>
                <CardDescription>By total state changes (7 days)</CardDescription>
              </CardHeader>
              <CardContent>
                <TopEntitiesChart data={data.topEntities} />
              </CardContent>
            </Card>
          </Link>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Cpu className="h-4 w-4 text-chart-3" />
                Entity Distribution
              </CardTitle>
              <CardDescription>By domain</CardDescription>
            </CardHeader>
            <CardContent>
              <DomainDistributionChart data={data.domainDistribution} />
            </CardContent>
          </Card>
        </div>
      ),

    "recent-activity": () =>
      data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-chart-2" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest entity state changes</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No recent activity. Run a sync to populate entity data.
              </p>
            ) : (
              <div className="space-y-1">
                {data.recentChanges.map((e, i) => (
                  <div
                    key={e.entityId}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent/30"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-2 rounded-full bg-primary/60" />
                      <div>
                        <span className="font-medium">
                          {e.friendlyName || e.entityId}
                        </span>
                        <span className="ml-2 text-muted-foreground text-xs">
                          {e.domain}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="font-mono text-xs">
                        {e.lastState}
                      </Badge>
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
      ),
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gradient">SmartHass</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered analysis of your smart home
            {newInsightCount > 0 && (
              <Badge variant="default" className="ml-2 glow-sm">
                {newInsightCount} new
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || !selectedInstance}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync"}
          </Button>
          <Button
            onClick={analyzeNow}
            disabled={analyzing}
            className={analyzing ? "" : "glow-sm"}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {analyzing ? "Analyzing…" : "Analyze Now"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizeOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {widgetOrder
        .filter((id) => !hiddenWidgets.has(id))
        .map((id) => {
          const render = widgets[id];
          return render ? <div key={id}>{render()}</div> : null;
        })}

      {/* Analysis progress dialog */}
      <Dialog
        open={analysisDialogOpen}
        onOpenChange={(open) => {
          if (!analyzing) setAnalysisDialogOpen(open);
        }}
      >
        <DialogContent showCloseButton={!analyzing} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {analysisResult === null
                ? "Running AI Analysis"
                : analysisResult.success
                  ? "Analysis Complete"
                  : "Analysis Failed"}
            </DialogTitle>
            <DialogDescription>
              {analysisResult === null
                ? "Analyzing your smart home data across multiple categories…"
                : analysisResult.success
                  ? `Generated ${analysisResult.totalInsights ?? 0} new insight${(analysisResult.totalInsights ?? 0) === 1 ? "" : "s"}.`
                  : analysisResult.error}
            </DialogDescription>
          </DialogHeader>

          {analysisResult === null && (
            <div className="space-y-3 py-2">
              {Object.entries(analysisCategoryLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          )}

          {analysisResult?.success && (
            <div className="space-y-3 py-2">
              {Object.entries(analysisResult.results ?? {}).map(([key, count]) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>{analysisCategoryLabels[key] ?? key}</span>
                  </div>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          )}

          {analysisResult && !analysisResult.success && (
            <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm">
              <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <span>{analysisResult.error}</span>
            </div>
          )}

          {analysisResult !== null && (
            <DialogFooter>
              <Button onClick={() => setAnalysisDialogOpen(false)}>
                {analysisResult.success ? "Done" : "Close"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <CustomizePanel
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        preferences={preferences}
        onSave={savePreferences}
      />

      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        syncing={syncing}
        syncResult={syncResult}
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  color = "primary",
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <Card className="relative overflow-hidden group hover:glow-sm transition-shadow duration-300">
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          background: `radial-gradient(circle at top right, var(--color-${color}), transparent 70%)`,
        }}
      />
      <CardHeader className="pb-2 relative">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs">{label}</CardDescription>
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `oklch(from var(--color-${color}) l c h / 0.15)` }}
          >
            <span style={{ color: `var(--color-${color})` }}>{icon}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <p className="text-xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function InsightSummaryCard({
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
          opacity: 0.06,
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
