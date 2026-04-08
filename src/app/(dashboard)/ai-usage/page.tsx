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
import {
  AlertCircle,
  Brain,
  Coins,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  BarChart3,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Clock,
  Lightbulb,
  AlertTriangle,
  Zap,
  GitBranch,
  Cpu,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SyncDialog, type SyncResult } from "@/components/sync-dialog";

interface HAInstance {
  id: string;
  name: string;
  status: string;
}

interface Totals {
  totalRuns: number;
  totalTokens: number;
  completedRuns: number;
  failedRuns: number;
  avgTokensPerRun: number;
}

interface Trend {
  currentTokens: number;
  previousTokens: number;
  currentRuns: number;
  previousRuns: number;
}

interface DailyUsage {
  date: string;
  tokens: number;
  runs: number;
}

interface AnalysisRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  tokensUsed: number | null;
  insightsGenerated: Record<string, number> | null;
  error: string | null;
}

interface UsageData {
  totals: Totals;
  trend: Trend;
  insightsByCategory: Record<string, number>;
  lastCompletedAt: string | null;
  dailyUsage: DailyUsage[];
  recentRuns: AnalysisRun[];
}

// Claude Sonnet 4: $3/MTok input, $15/MTok output — blended ~$6/MTok
const COST_PER_TOKEN = 0.000006;

const CATEGORY_META: Record<string, { label: string; icon: typeof Brain }> = {
  usage_patterns: { label: "Usage Patterns", icon: Lightbulb },
  anomaly_detection: { label: "Anomaly Detection", icon: AlertTriangle },
  automation_gaps: { label: "Automation Gaps", icon: Zap },
  efficiency: { label: "Efficiency", icon: Activity },
  cross_device_correlation: { label: "Correlations", icon: GitBranch },
  device_suggestions: { label: "Device Ideas", icon: Cpu },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatCost(tokens: number): string {
  const cost = tokens * COST_PER_TOKEN;
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(2)}`;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function TrendBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <TrendingUp className="h-3 w-3 text-primary" /> new
    </span>
  );
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={`vs. prior 30 days: ${label}`}>
      <Minus className="h-3 w-3" /> flat
    </span>
  );
  const up = pct > 0;
  return (
    <span
      className={`flex items-center gap-1 text-xs ${up ? "text-accent-warm" : "text-chart-2"}`}
      title={`${up ? "+" : ""}${pct}% vs. prior 30 days`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? "+" : ""}{pct}%
    </span>
  );
}

function TokenBar({ dailyUsage }: { dailyUsage: DailyUsage[] }) {
  if (dailyUsage.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
        No usage data yet
      </div>
    );
  }

  const maxTokens = Math.max(...dailyUsage.map((d) => d.tokens), 1);

  // Show date labels every ~7 days
  const labelIndices = new Set([0, 7, 14, 21, dailyUsage.length - 1]);

  return (
    <div>
      <div className="flex items-end gap-[3px] h-44">
        {dailyUsage.map((d, i) => {
          const height = d.tokens > 0 ? Math.max((d.tokens / maxTokens) * 100, 3) : 0;
          return (
            <div
              key={d.date}
              className="flex-1 flex flex-col items-center justify-end group relative"
            >
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 hidden group-hover:block glass-strong rounded-md px-2.5 py-1.5 text-xs whitespace-nowrap z-10 shadow-lg">
                <div className="font-medium">{new Date(d.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                <div className="text-muted-foreground">{formatNumber(d.tokens)} tokens &middot; {d.runs} run{d.runs !== 1 ? "s" : ""}</div>
              </div>
              {height > 0 ? (
                <div
                  className="w-full rounded-t bg-primary/50 hover:bg-primary/70 transition-colors min-w-[3px]"
                  style={{ height: `${height}%` }}
                />
              ) : (
                <div className="w-full h-[1px] bg-border/40 rounded" />
              )}
            </div>
          );
        })}
      </div>
      {/* X-axis date labels */}
      <div className="flex gap-[3px] mt-2">
        {dailyUsage.map((d, i) => (
          <div key={d.date} className="flex-1 text-center">
            {labelIndices.has(i) && (
              <span className="text-[10px] text-muted-foreground">
                {new Date(d.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function RunRow({ run }: { run: AnalysisRun }) {
  const [expanded, setExpanded] = useState(false);
  const insights = run.insightsGenerated ?? {};
  const totalInsights = Object.values(insights).reduce((a, b) => a + b, 0);
  const hasBreakdown = Object.keys(insights).length > 1;

  return (
    <>
      <tr className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
        <td className="py-2.5 pr-4 whitespace-nowrap">
          {new Date(run.startedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </td>
        <td className="py-2.5 pr-4">
          <Badge
            variant={
              run.status === "completed"
                ? "default"
                : run.status === "failed"
                ? "destructive"
                : "secondary"
            }
            className="text-xs"
          >
            {run.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
            {run.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
            {run.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {run.status}
          </Badge>
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {run.tokensUsed ? formatNumber(run.tokensUsed) : "—"}
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
          {run.tokensUsed ? formatCost(run.tokensUsed) : "—"}
        </td>
        <td className="py-2.5 pr-4 text-right tabular-nums">
          {formatDuration(run.startedAt, run.completedAt)}
        </td>
        <td className="py-2.5">
          {totalInsights > 0 ? (
            <button
              onClick={() => hasBreakdown && setExpanded(!expanded)}
              className={`text-xs flex items-center gap-1 ${hasBreakdown ? "text-primary hover:underline cursor-pointer" : "text-muted-foreground"}`}
            >
              {totalInsights} insight{totalInsights !== 1 ? "s" : ""}
              {hasBreakdown && (expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </button>
          ) : run.error ? (
            <span className="text-xs text-destructive truncate max-w-[200px] inline-block" title={run.error}>
              {run.error}
            </span>
          ) : (
            "—"
          )}
        </td>
      </tr>
      {expanded && hasBreakdown && (
        <tr className="border-b border-border/30">
          <td colSpan={6} className="py-2 pl-8">
            <div className="flex flex-wrap gap-2">
              {Object.entries(insights).map(([cat, n]) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta?.icon ?? Sparkles;
                return (
                  <span key={cat} className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1">
                    <Icon className="h-3 w-3" />
                    {meta?.label ?? cat}: <span className="font-medium text-foreground">{n}</span>
                  </span>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function AIUsagePage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

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

  const loadUsage = useCallback(async (instanceId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-usage?instanceId=${instanceId}`);
      if (res.ok) {
        setData(await res.json());
      } else {
        setError("Failed to load AI usage data.");
      }
    } catch {
      setError("Network error. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedInstance) {
      loadUsage(selectedInstance);
    }
  }, [selectedInstance, loadUsage]);

  async function syncNow() {
    if (!selectedInstance) return;
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
        await loadUsage(selectedInstance);
      } else {
        setSyncResult({ success: false, error: data.error || "Sync failed" });
      }
    } catch {
      setSyncResult({ success: false, error: "Network error. Please try again." });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-xl font-bold tracking-tight text-gradient">AI Usage</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={() => selectedInstance && loadUsage(selectedInstance)}>Retry</Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Brain className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold">No instances connected</h2>
        <p className="text-muted-foreground">
          Connect a Home Assistant instance in Settings to start tracking AI
          usage.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gradient">
            AI Usage
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground text-sm">
              Monitor token consumption and analysis runs.
            </p>
            {data?.lastCompletedAt && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Last run {timeAgo(data.lastCompletedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              value={selectedInstance}
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
            onClick={syncNow}
            disabled={syncing}
            variant="outline"
            className={syncing ? "" : "glow-sm"}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync Now"}
          </Button>
        </div>
      </div>

      {/* Sync progress dialog */}
      <SyncDialog
        open={syncDialogOpen}
        onOpenChange={setSyncDialogOpen}
        syncing={syncing}
        syncResult={syncResult}
      />

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="glass-card glow-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Cost (est.)</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(data?.totals.totalTokens ?? 0)}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {formatNumber(data?.totals.totalTokens ?? 0)} tokens
              </p>
              {data?.trend && <TrendBadge current={data.trend.currentTokens} previous={data.trend.previousTokens} label="tokens" />}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Analysis Runs
            </CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.totals.totalRuns ?? 0}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {data?.totals.completedRuns ?? 0} completed,{" "}
                {data?.totals.failedRuns ?? 0} failed
              </p>
              {data?.trend && <TrendBadge current={data.trend.currentRuns} previous={data.trend.previousRuns} label="runs" />}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Cost / Run
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCost(data?.totals.avgTokensPerRun ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatNumber(data?.totals.avgTokensPerRun ?? 0)} tokens avg
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.totals.totalRuns
                ? `${Math.round(
                    ((data.totals.completedRuns) / data.totals.totalRuns) * 100
                  )}%`
                : "N/A"}
            </div>
            <p className="text-xs text-muted-foreground">
              Of all analysis runs
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily usage chart + category breakdown side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="glass-card glow-border lg:col-span-2">
          <CardHeader>
            <CardTitle>Daily Token Usage</CardTitle>
            <CardDescription>Last 30 days{data?.trend ? ` — ${formatCost(data.trend.currentTokens)} this period` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <TokenBar dailyUsage={data?.dailyUsage ?? []} />
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader>
            <CardTitle>Insights by Category</CardTitle>
            <CardDescription>
              {Object.values(data?.insightsByCategory ?? {}).reduce((a, b) => a + b, 0)} total generated
            </CardDescription>
          </CardHeader>
          <CardContent>
            {Object.keys(data?.insightsByCategory ?? {}).length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                No insights yet
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(data!.insightsByCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, n]) => {
                    const meta = CATEGORY_META[cat];
                    const Icon = meta?.icon ?? Sparkles;
                    const total = Object.values(data!.insightsByCategory).reduce((a, b) => a + b, 0);
                    const pct = total > 0 ? (n / total) * 100 : 0;
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            <Icon className="h-3.5 w-3.5" />
                            {meta?.label ?? cat}
                          </span>
                          <span className="font-medium tabular-nums">{n}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/60 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent runs table */}
      <Card className="glass-card glow-border">
        <CardHeader>
          <CardTitle>Recent Analysis Runs</CardTitle>
          <CardDescription>Last 20 runs</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.recentRuns.length ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No analysis runs yet. Trigger one from the Dashboard.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Date
                    </th>
                    <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                      Status
                    </th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">
                      Tokens
                    </th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">
                      Cost
                    </th>
                    <th className="text-right py-2 pr-4 text-muted-foreground font-medium">
                      Duration
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-medium">
                      Insights
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRuns.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
