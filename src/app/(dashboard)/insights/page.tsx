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
  const [analyzing, setAnalyzing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
    const params = new URLSearchParams({ instanceId: selectedInstance });
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter === "new") params.set("status", "new");
    if (statusFilter === "dismissed") params.set("status", "dismissed");

    const res = await fetch(`/api/insights?${params}`);
    if (res.ok) {
      const data = await res.json();
      setInsights(data.insights);
      setCounts(data.counts);
      setNewCount(data.newCount);
    }
    setLoading(false);
  }, [selectedInstance, typeFilter, statusFilter]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  // Update status
  async function handleStatusChange(id: string, status: Insight["status"]) {
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
    }
  }

  // Trigger analysis
  async function analyzeNow() {
    if (!selectedInstance) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance }),
      });
      if (res.ok) {
        await loadInsights();
      }
    } finally {
      setAnalyzing(false);
    }
  }

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
  };
  for (const ins of filteredInsights) {
    if (typeFilter === "all" || ins.type === typeFilter) {
      grouped[ins.type].push(ins);
    }
  }

  const totalInsights = Object.values(counts).reduce((a, b) => a + b, 0);

  if (loading && instances.length === 0) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No Home Assistant instances connected. Add one in Settings to get
            started.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Insights</h1>
          <p className="text-muted-foreground">
            AI-generated analysis of your smart home.
            {newCount > 0 && (
              <Badge variant="default" className="ml-2">
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
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name}
                </option>
              ))}
            </select>
          )}
          <Button
            onClick={analyzeNow}
            disabled={analyzing}
          >
            {analyzing ? "Analyzing…" : "Analyze Now"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Insights"
          value={totalInsights}
          description="All time"
        />
        <SummaryCard
          label="Patterns"
          value={counts.insight ?? 0}
          description="Usage patterns found"
        />
        <SummaryCard
          label="Anomalies"
          value={counts.anomaly ?? 0}
          description="Unusual activity detected"
        />
        <SummaryCard
          label="Automations"
          value={(counts.automation ?? 0) + (counts.suggestion ?? 0)}
          description="Suggestions & automation ideas"
        />
      </div>

      <Separator />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={typeFilter === "all"}
          onClick={() => setTypeFilter("all")}
        >
          All Types
        </FilterButton>
        <FilterButton
          active={typeFilter === "insight"}
          onClick={() => setTypeFilter("insight")}
        >
          Patterns
        </FilterButton>
        <FilterButton
          active={typeFilter === "anomaly"}
          onClick={() => setTypeFilter("anomaly")}
        >
          Anomalies
        </FilterButton>
        <FilterButton
          active={typeFilter === "suggestion"}
          onClick={() => setTypeFilter("suggestion")}
        >
          Suggestions
        </FilterButton>
        <FilterButton
          active={typeFilter === "automation"}
          onClick={() => setTypeFilter("automation")}
        >
          Automations
        </FilterButton>
        <span className="mx-2" />
        <FilterButton
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        >
          All
        </FilterButton>
        <FilterButton
          active={statusFilter === "new"}
          onClick={() => setStatusFilter("new")}
        >
          Unread
        </FilterButton>
        <FilterButton
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        >
          Active
        </FilterButton>
        <FilterButton
          active={statusFilter === "dismissed"}
          onClick={() => setStatusFilter("dismissed")}
        >
          Dismissed
        </FilterButton>
      </div>

      {/* Insights feed */}
      {loading ? (
        <p className="text-muted-foreground text-sm py-4">
          Loading insights…
        </p>
      ) : filteredInsights.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {totalInsights === 0
              ? 'No insights generated yet. Click "Analyze Now" to run AI analysis on your smart home data.'
              : "No insights match the current filters."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {/* Anomalies first */}
          {grouped.anomaly.length > 0 && (
            <InsightSection
              title="Anomalies"
              description="Unusual activity detected in your smart home"
              insights={grouped.anomaly}
              onStatusChange={handleStatusChange}
            />
          )}

          {/* Patterns */}
          {grouped.insight.length > 0 && (
            <InsightSection
              title="Usage Patterns"
              description="Recurring patterns in your device usage"
              insights={grouped.insight}
              onStatusChange={handleStatusChange}
            />
          )}

          {/* Suggestions */}
          {grouped.suggestion.length > 0 && (
            <InsightSection
              title="Suggestions"
              description="Recommended improvements for your setup"
              insights={grouped.suggestion}
              onStatusChange={handleStatusChange}
            />
          )}

          {/* Automations */}
          {grouped.automation.length > 0 && (
            <InsightSection
              title="Automation Ideas"
              description="Suggested automations based on your usage"
              insights={grouped.automation}
              onStatusChange={handleStatusChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function InsightSection({
  title,
  description,
  insights,
  onStatusChange,
}: {
  title: string;
  description: string;
  insights: Insight[];
  onStatusChange: (id: string, status: Insight["status"]) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-3">
        {insights.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            onStatusChange={onStatusChange}
          />
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
    >
      {children}
    </Button>
  );
}
