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
  dailyUsage: DailyUsage[];
  recentRuns: AnalysisRun[];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "In progress";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
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

  return (
    <div className="flex items-end gap-1 h-48">
      {dailyUsage.map((d) => {
        const height = Math.max((d.tokens / maxTokens) * 100, 2);
        return (
          <div
            key={d.date}
            className="flex-1 flex flex-col items-center gap-1 group relative"
          >
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 hidden group-hover:block glass-strong rounded px-2 py-1 text-xs whitespace-nowrap z-10">
              {d.date}: {formatNumber(d.tokens)} tokens, {d.runs} run{d.runs !== 1 ? "s" : ""}
            </div>
            <div
              className="w-full rounded-t bg-primary/60 hover:bg-primary/80 transition-colors min-w-[4px]"
              style={{ height: `${height}%` }}
            />
          </div>
        );
      })}
    </div>
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
          <p className="text-muted-foreground">
            Monitor token consumption and analysis runs.
          </p>
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
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
            <Coins className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(data?.totals.totalTokens ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              ~${((data?.totals.totalTokens ?? 0) * 0.000003).toFixed(4)} est.
              cost
            </p>
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
            <p className="text-xs text-muted-foreground">
              {data?.totals.completedRuns ?? 0} completed,{" "}
              {data?.totals.failedRuns ?? 0} failed
            </p>
          </CardContent>
        </Card>

        <Card className="glass-card glow-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Tokens / Run
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(data?.totals.avgTokensPerRun ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per completed analysis
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

      {/* Daily usage chart */}
      <Card className="glass-card glow-border">
        <CardHeader>
          <CardTitle>Daily Token Usage</CardTitle>
          <CardDescription>Last 30 days</CardDescription>
        </CardHeader>
        <CardContent>
          <TokenBar dailyUsage={data?.dailyUsage ?? []} />
        </CardContent>
      </Card>

      {/* Recent runs table */}
      <Card className="glass-card glow-border">
        <CardHeader>
          <CardTitle>Recent Analysis Runs</CardTitle>
          <CardDescription>Last 20 runs</CardDescription>
        </CardHeader>
        <CardContent>
          {!data?.recentRuns.length ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No analysis runs yet. Trigger one from the Insights page.
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
                      Duration
                    </th>
                    <th className="text-left py-2 text-muted-foreground font-medium">
                      Insights
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentRuns.map((run) => {
                    const insights = run.insightsGenerated ?? {};
                    const totalInsights = Object.values(insights).reduce(
                      (a, b) => a + b,
                      0
                    );
                    return (
                      <tr
                        key={run.id}
                        className="border-b border-border/30 last:border-0"
                      >
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
                            {run.status === "completed" && (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            {run.status === "failed" && (
                              <XCircle className="h-3 w-3 mr-1" />
                            )}
                            {run.status === "running" && (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            )}
                            {run.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {run.tokensUsed
                            ? formatNumber(run.tokensUsed)
                            : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-right tabular-nums">
                          {formatDuration(run.startedAt, run.completedAt)}
                        </td>
                        <td className="py-2.5">
                          {totalInsights > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {totalInsights} insight
                              {totalInsights !== 1 ? "s" : ""}
                            </span>
                          ) : run.error ? (
                            <span
                              className="text-xs text-destructive truncate max-w-[200px] inline-block"
                              title={run.error}
                            >
                              {run.error}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
