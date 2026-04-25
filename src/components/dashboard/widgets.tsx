"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WidgetWrapper } from "./widget-wrapper";
import { Widget } from "./widget-context";
import {
  Activity,
  Zap,
  Lightbulb,
  ThermometerSun,
  Lock,
  Tv,
  Fan,
  Power,
  AlertTriangle,
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Home,
  Wifi,
  WifiOff,
  ArrowRight,
} from "lucide-react";

// ─── Stats Widget ───────────────────────────────────────────────────────────

interface StatsData {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
}

export function StatsWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [stats, setStats] = useState<StatsData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/dashboard/stats?instanceId=${instanceId}`)
      .then((r) => r.json())
      .then((data) => {
        setStats([
          {
            label: "Entities",
            value: data.entityCount ?? 0,
          },
          {
            label: "Automations",
            value: data.automationCount ?? 0,
          },
          {
            label: "Tracked",
            value: data.trackedCount ?? 0,
          },
          {
            label: "Changes (24h)",
            value: data.stateChanges24h ?? 0,
          },
        ]);
      })
      .finally(() => setLoading(false));
  }, [instanceId]);

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-1">
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-xl font-semibold">{stat.value}</p>
            {stat.change !== undefined && (
              <div className="flex items-center gap-1 text-xs">
                {stat.change > 0 ? (
                  <TrendingUp className="h-3 w-3 text-success" />
                ) : stat.change < 0 ? (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                ) : (
                  <Minus className="h-3 w-3 text-muted-foreground" />
                )}
                <span className={stat.change > 0 ? "text-success" : stat.change < 0 ? "text-destructive" : ""}>
                  {stat.changeLabel ?? `${Math.abs(stat.change)}%`}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}

// ─── Health Widget ──────────────────────────────────────────────────────────

interface HealthData {
  name: string;
  status: "connected" | "error" | "pending";
  haVersion?: string;
  lastSyncAt?: string;
}

export function HealthWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/dashboard/stats?instanceId=${instanceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.instance) {
          setHealth({
            name: data.instance.name,
            status: data.instance.status,
            haVersion: data.instance.haVersion,
            lastSyncAt: data.instance.lastSyncAt,
          });
        }
      })
      .finally(() => setLoading(false));
  }, [instanceId]);

  const statusColors = {
    connected: "text-success",
    error: "text-destructive",
    pending: "text-warning",
  };

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      {health ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {health.status === "connected" ? (
              <Wifi className={`h-5 w-5 ${statusColors[health.status]}`} />
            ) : (
              <WifiOff className={`h-5 w-5 ${statusColors[health.status]}`} />
            )}
            <div>
              <p className="font-medium">{health.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{health.status}</p>
            </div>
          </div>
          {health.haVersion && (
            <div className="text-xs text-muted-foreground">
              HA Version: {health.haVersion}
            </div>
          )}
          {health.lastSyncAt && (
            <div className="text-xs text-muted-foreground">
              Last sync: {new Date(health.lastSyncAt).toLocaleString()}
            </div>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No instance connected</p>
      )}
    </WidgetWrapper>
  );
}

// ─── Entity List Widget ─────────────────────────────────────────────────────

interface EntityData {
  id: string;
  entityId: string;
  friendlyName: string;
  domain: string;
  lastState: string;
  lastChangedAt: string;
}

const DOMAIN_ICONS: Record<string, typeof Activity> = {
  light: Lightbulb,
  switch: Power,
  climate: ThermometerSun,
  lock: Lock,
  media_player: Tv,
  fan: Fan,
  sensor: Activity,
  binary_sensor: Activity,
};

export function EntityListWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [entities, setEntities] = useState<EntityData[]>([]);
  const [loading, setLoading] = useState(true);

  const config = widget.config as { domain?: string; limit?: number } | undefined;
  const limit = config?.limit ?? 10;
  const domain = config?.domain;

  useEffect(() => {
    if (!instanceId) return;
    const params = new URLSearchParams({
      instanceId,
      limit: String(limit),
      ...(domain && { domain }),
    });
    fetch(`/api/entities?${params}`)
      .then((r) => r.json())
      .then((data) => setEntities(data.entities ?? []))
      .finally(() => setLoading(false));
  }, [instanceId, limit, domain]);

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {entities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No entities</p>
        ) : (
          entities.map((entity) => {
            const Icon = DOMAIN_ICONS[entity.domain] ?? Activity;
            const isOn = ["on", "home", "open", "unlocked"].includes(entity.lastState?.toLowerCase() ?? "");
            return (
              <Link
                key={entity.id}
                href={`/entities/${entity.id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
              >
                <div className={`p-1.5 rounded-lg ${isOn ? "bg-primary/15" : "bg-muted"}`}>
                  <Icon className={`h-4 w-4 ${isOn ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entity.friendlyName || entity.entityId}</p>
                  <p className="text-xs text-muted-foreground">{entity.domain}</p>
                </div>
                <Badge variant={isOn ? "default" : "secondary"} className="text-xs">
                  {entity.lastState}
                </Badge>
              </Link>
            );
          })
        )}
      </div>
      <Link
        href="/entities"
        className="flex items-center justify-center gap-1 mt-3 text-xs text-primary hover:underline"
      >
        View all entities
        <ArrowRight className="h-3 w-3" />
      </Link>
    </WidgetWrapper>
  );
}

// ─── Insights Widget ────────────────────────────────────────────────────────

interface InsightData {
  id: string;
  type: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
}

export function InsightsWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [insights, setInsights] = useState<InsightData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/insights?instanceId=${instanceId}&limit=5`)
      .then((r) => r.json())
      .then((data) => setInsights(data.insights ?? []))
      .finally(() => setLoading(false));
  }, [instanceId]);

  const typeIcons: Record<string, typeof Lightbulb> = {
    insight: Lightbulb,
    suggestion: Zap,
    anomaly: AlertTriangle,
    automation: Zap,
    correlation: Activity,
  };

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      <div className="space-y-3 max-h-[300px] overflow-y-auto">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No insights yet</p>
        ) : (
          insights.map((insight) => {
            const Icon = typeIcons[insight.type] ?? Lightbulb;
            return (
              <div key={insight.id} className="flex gap-3 p-2 rounded-lg hover:bg-accent transition-colors">
                <div className="p-1.5 rounded-lg bg-primary/15 h-fit">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{insight.content}</p>
                </div>
                {insight.status === "new" && (
                  <Badge variant="default" className="text-[10px] h-5">New</Badge>
                )}
              </div>
            );
          })
        )}
      </div>
      <Link
        href="/insights"
        className="flex items-center justify-center gap-1 mt-3 text-xs text-primary hover:underline"
      >
        View all insights
        <ArrowRight className="h-3 w-3" />
      </Link>
    </WidgetWrapper>
  );
}

// ─── Activity Widget ────────────────────────────────────────────────────────

interface ActivityEntry {
  entityId: string;
  friendlyName: string;
  state: string;
  changedAt: string;
}

export function ActivityWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/dashboard/activity?instanceId=${instanceId}&limit=10`)
      .then((r) => r.json())
      .then((data) => setActivity(data.activity ?? []))
      .finally(() => setLoading(false));
  }, [instanceId]);

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {activity.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        ) : (
          activity.map((entry, i) => (
            <div key={i} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{entry.friendlyName || entry.entityId}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.changedAt).toLocaleTimeString()}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {entry.state}
              </Badge>
            </div>
          ))
        )}
      </div>
    </WidgetWrapper>
  );
}

// ─── Areas Widget ───────────────────────────────────────────────────────────

interface AreaData {
  id: string;
  name: string;
  entityCount: number;
  activeCount: number;
}

export function AreasWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [areas, setAreas] = useState<AreaData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!instanceId) return;
    fetch(`/api/areas?instanceId=${instanceId}`)
      .then((r) => r.json())
      .then((data) => setAreas(data.areas ?? []))
      .catch(() => setAreas([]))
      .finally(() => setLoading(false));
  }, [instanceId]);

  return (
    <WidgetWrapper widget={widget} loading={loading}>
      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {areas.length === 0 ? (
          <div className="text-center py-4">
            <Home className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No areas configured</p>
          </div>
        ) : (
          areas.map((area) => (
            <Link
              key={area.id}
              href={`/entities?area=${area.id}`}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent transition-colors"
            >
              <div className="p-1.5 rounded-lg bg-primary/15">
                <Home className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{area.name}</p>
                <p className="text-xs text-muted-foreground">
                  {area.entityCount} entities
                </p>
              </div>
              {area.activeCount > 0 && (
                <Badge variant="default" className="text-[10px]">
                  {area.activeCount} active
                </Badge>
              )}
            </Link>
          ))
        )}
      </div>
    </WidgetWrapper>
  );
}

// ─── Quick Actions Widget ───────────────────────────────────────────────────

export function QuickActionsWidget({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  const [syncing, setSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const handleSync = async () => {
    if (!instanceId || syncing) return;
    setSyncing(true);
    try {
      await fetch("/api/ha/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAnalyze = async () => {
    if (!instanceId || analyzing) return;
    setAnalyzing(true);
    try {
      await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <WidgetWrapper widget={widget}>
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={handleSync}
          disabled={syncing || !instanceId}
        >
          <Activity className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Now"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={handleAnalyze}
          disabled={analyzing || !instanceId}
        >
          <Lightbulb className={`h-4 w-4 mr-2 ${analyzing ? "animate-pulse" : ""}`} />
          {analyzing ? "Analyzing..." : "Run Analysis"}
        </Button>
        <Link href="/settings">
          <Button variant="outline" size="sm" className="w-full justify-start">
            <Activity className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </Link>
      </div>
    </WidgetWrapper>
  );
}

// ─── Widget Renderer ────────────────────────────────────────────────────────

export function WidgetRenderer({
  widget,
  instanceId,
}: {
  widget: Widget;
  instanceId: string | null;
}) {
  switch (widget.type) {
    case "stats":
      return <StatsWidget widget={widget} instanceId={instanceId} />;
    case "health":
      return <HealthWidget widget={widget} instanceId={instanceId} />;
    case "entity_list":
      return <EntityListWidget widget={widget} instanceId={instanceId} />;
    case "insights":
      return <InsightsWidget widget={widget} instanceId={instanceId} />;
    case "activity":
      return <ActivityWidget widget={widget} instanceId={instanceId} />;
    case "areas":
      return <AreasWidget widget={widget} instanceId={instanceId} />;
    case "quick_actions":
      return <QuickActionsWidget widget={widget} instanceId={instanceId} />;
    default:
      return (
        <WidgetWrapper widget={widget}>
          <p className="text-sm text-muted-foreground">Widget type not implemented</p>
        </WidgetWrapper>
      );
  }
}
