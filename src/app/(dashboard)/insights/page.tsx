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
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  Brain,
  AlertTriangle,
  Lightbulb,
  Zap,
  GitBranch,
  Cpu,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

type InsightType = Insight["type"];
type FilterType = "all" | InsightType;
type StatusFilter = "all" | "new" | "active" | "dismissed";

export default function InsightsPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [insights, setInsights] = useState<Insight[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [newCount, setNewCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    success: boolean;
    totalInsights?: number;
    results?: Record<string, number>;
    error?: string;
  } | null>(null);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const { toast } = useToast();

  // Load instances
  useEffect(() => {
    async function loadInstances() {
      const res = await fetch("/api/ha/instances");
      if (res.ok) {
        const data = await res.json();
        setInstances(data);
        if (data.length > 0) {
          setSelectedInstance(data[0].id);
        }
      }
      setLoading(false);
    }
    loadInstances();
  }, []);

  // Load insights when instance changes
  const loadInsights = useCallback(async () => {
    if (!selectedInstance) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ instanceId: selectedInstance });
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter === "new") params.set("status", "new");
    if (statusFilter === "dismissed") params.set("status", "dismissed");

    try {
      const res = await fetch(`/api/insights?${params}`);
      if (res.ok) {
        const data = await res.json();
        setInsights(data.insights);
        setCounts(data.counts);
        setNewCount(data.newCount);
      } else {
        setError("Failed to load insights.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    }
    setLoading(false);
  }, [selectedInstance, typeFilter, statusFilter]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // Update status
  async function handleStatusChange(id: string, status: Insight["status"]) {
    try {
      const res = await fetch("/api/insights", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setInsights((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status } : i))
        );
        if (status === "viewed" || status === "dismissed") {
          setNewCount((prev) => Math.max(0, prev - 1));
        }
        toast("success", status === "dismissed" ? "Insight dismissed" : "Insight updated");
      } else {
        toast("error", "Failed to update insight status");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }

  // Trigger analysis
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

  const analysisCategoryLabels: Record<string, string> = {
    usage_patterns: "Usage Patterns",
    anomaly_detection: "Anomaly Detection",
    automation_gaps: "Automation Gaps",
    efficiency: "Efficiency",
    cross_device_correlation: "Cross-Device Correlation",
    device_suggestions: "Device Suggestions",
  };

  // Filter insights by status (active = not dismissed)
  const filteredInsights =
    statusFilter === "active"
      ? insights.filter((i) => i.status !== "dismissed")
      : insights;

  // Group insights by type
  const grouped: Record<InsightType, Insight[]> = {
    insight: [],
    anomaly: [],
    suggestion: [],
    automation: [],
    correlation: [],
    device_recommendation: [],
  };
  for (const ins of filteredInsights) {
    if (typeFilter === "all" || ins.type === typeFilter) {
      grouped[ins.type].push(ins);
    }
  }

  const totalInsights = Object.values(counts).reduce((a, b) => a + b, 0);

  if (loading && instances.length === 0) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[...Array(6)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-xl" />)}</div>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">AI Insights</h1>
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Brain className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No Home Assistant instances connected. Add one in{" "}
              <a href="/settings" className="text-primary hover:underline">Settings</a> to get started.
            </p>
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
          <h1 className="text-2xl font-bold tracking-tight text-gradient">AI Insights</h1>
          <p className="text-sm text-muted-foreground">
            AI-powered analysis of your smart home
            {newCount > 0 && (
              <Badge variant="default" className="ml-2 glow-sm">
                {newCount} new
              </Badge>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}
          <Button
            onClick={analyzeNow}
            disabled={analyzing}
            className={analyzing ? "" : "glow-sm"}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {analyzing ? "Analyzing…" : "Analyze Now"}
          </Button>
        </div>
      </div>

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

          {/* Processing state */}
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

          {/* Success state */}
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

          {/* Error state */}
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

      {/* Summary cards (clickable filters) */}
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryCard label="Total" value={totalInsights} icon={<Brain className="h-4 w-4" />} color="primary" active={typeFilter === "all"} onClick={() => setTypeFilter("all")} />
        <SummaryCard label="Patterns" value={counts.insight ?? 0} icon={<Lightbulb className="h-4 w-4" />} color="chart-4" active={typeFilter === "insight"} onClick={() => setTypeFilter("insight")} />
        <SummaryCard label="Anomalies" value={counts.anomaly ?? 0} icon={<AlertTriangle className="h-4 w-4" />} color="destructive" active={typeFilter === "anomaly"} onClick={() => setTypeFilter("anomaly")} />
        <SummaryCard label="Automations" value={(counts.automation ?? 0) + (counts.suggestion ?? 0)} icon={<Zap className="h-4 w-4" />} color="chart-2" active={typeFilter === "automation" || typeFilter === "suggestion"} onClick={() => setTypeFilter("automation")} />
        <SummaryCard label="Correlations" value={counts.correlation ?? 0} icon={<GitBranch className="h-4 w-4" />} color="chart-3" active={typeFilter === "correlation"} onClick={() => setTypeFilter("correlation")} />
        <SummaryCard label="Device Ideas" value={counts.device_recommendation ?? 0} icon={<Cpu className="h-4 w-4" />} color="chart-5" active={typeFilter === "device_recommendation"} onClick={() => setTypeFilter("device_recommendation")} />
      </div>

      <Separator className="opacity-30" />

      {/* Status filters */}
      <div className="flex flex-wrap gap-2">
        <FilterButton active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>All</FilterButton>
        <FilterButton active={statusFilter === "new"} onClick={() => setStatusFilter("new")}>Unread</FilterButton>
        <FilterButton active={statusFilter === "active"} onClick={() => setStatusFilter("active")}>Active</FilterButton>
        <FilterButton active={statusFilter === "dismissed"} onClick={() => setStatusFilter("dismissed")}>Dismissed</FilterButton>
      </div>

      {/* Insights feed */}
      {loading ? (
        <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-muted rounded-xl animate-pulse" />)}</div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadInsights}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : filteredInsights.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <Brain className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">
              {totalInsights === 0
                ? 'No insights generated yet. Click "Analyze Now" to run AI analysis.'
                : "No insights match the current filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {grouped.anomaly.length > 0 && (
            <InsightSection title="Anomalies" description="Unusual activity detected" icon={<AlertTriangle className="h-5 w-5 text-destructive" />} insights={grouped.anomaly} onStatusChange={handleStatusChange} />
          )}
          {grouped.correlation.length > 0 && (
            <InsightSection title="Cross-Device Correlations" description="Patterns between multiple devices" icon={<GitBranch className="h-5 w-5 text-chart-3" />} insights={grouped.correlation} onStatusChange={handleStatusChange} />
          )}
          {grouped.insight.length > 0 && (
            <InsightSection title="Usage Patterns" description="Recurring patterns in your device usage" icon={<Lightbulb className="h-5 w-5 text-chart-4" />} insights={grouped.insight} onStatusChange={handleStatusChange} />
          )}
          {grouped.suggestion.length > 0 && (
            <InsightSection title="Efficiency Suggestions" description="Improvements for your setup" icon={<Sparkles className="h-5 w-5 text-chart-2" />} insights={grouped.suggestion} onStatusChange={handleStatusChange} />
          )}
          {grouped.automation.length > 0 && (
            <InsightSection title="Automation Ideas" description="AI-generated automations" icon={<Zap className="h-5 w-5 text-primary" />} insights={grouped.automation} onStatusChange={handleStatusChange} />
          )}
          {grouped.device_recommendation.length > 0 && (
            <InsightSection title="Device Recommendations" description="New devices to enhance your smart home" icon={<Cpu className="h-5 w-5 text-chart-5" />} insights={grouped.device_recommendation} onStatusChange={handleStatusChange} />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  color = "primary",
  active = false,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`relative overflow-hidden cursor-pointer transition-all hover:scale-[1.02] ${
        active
          ? "ring-2 ring-primary/60 shadow-[0_0_12px_rgba(var(--color-primary-rgb,56,189,179),0.25)]"
          : "hover:ring-1 hover:ring-border"
      }`}
      onClick={onClick}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at top right, var(--color-${color}), transparent 70%)`, opacity: active ? 0.12 : 0.06 }} />
      <CardContent className="pt-4 pb-3 relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span style={{ color: `var(--color-${color})` }}>{icon}</span>
        </div>
        <p className="text-xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function InsightSection({
  title,
  description,
  icon,
  insights,
  onStatusChange,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  insights: Insight[];
  onStatusChange: (id: string, status: Insight["status"]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="secondary" className="ml-auto">{insights.length}</Badge>
      </div>
      <div className="grid gap-3">
        {insights.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onStatusChange={onStatusChange} />
        ))}
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className={`text-xs ${active ? "glow-sm" : "border-border/50"}`}
    >
      {children}
    </Button>
  );
}
