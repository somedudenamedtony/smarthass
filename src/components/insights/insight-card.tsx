"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Lightbulb,
  AlertTriangle,
  Zap,
  Sparkles,
  GitBranch,
  Cpu,
  Rocket,
  Eye,
  EyeOff,
  RotateCcw,
  Copy,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";

interface InsightMetadata {
  entityIds?: string[];
  confidence?: number;
  automationYaml?: string;
  deployedAutomationId?: string;
  deployedAt?: string;
  anomalyDetails?: {
    entityId: string;
    expectedPattern: string;
    actualEvent: string;
    timestamp: string;
  };
  efficiencyDetails?: {
    entityId: string;
    currentUsage: string;
    suggestedChange: string;
    estimatedImpact: string;
  };
  correlationDetails?: {
    entityPairs: Array<{ entityA: string; entityB: string; relationship: string; strength: number }>;
    timeWindow: string;
    patternType: string;
  };
  deviceRecommendation?: {
    suggestedDevice: string;
    deviceType: string;
    rationale: string;
    enhancedEntities: string[];
    estimatedBenefit: string;
  };
  trendDirection?: "improving" | "declining" | "stable" | "volatile";
  trendPercentage?: number;
  category?: string;
}

export interface Insight {
  id: string;
  instanceId: string;
  type: "insight" | "suggestion" | "automation" | "anomaly" | "correlation" | "device_recommendation";
  title: string;
  content: string;
  metadata: InsightMetadata | null;
  status: "new" | "viewed" | "dismissed" | "applied";
  createdAt: string;
}

const TYPE_CONFIG: Record<
  Insight["type"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive"; icon: typeof Lightbulb; accentClass: string }
> = {
  insight: { label: "Pattern", variant: "secondary", icon: Lightbulb, accentClass: "text-chart-4 bg-chart-4/15" },
  suggestion: { label: "Suggestion", variant: "secondary", icon: Sparkles, accentClass: "text-chart-2 bg-chart-2/15" },
  automation: { label: "Automation", variant: "default", icon: Zap, accentClass: "text-primary bg-primary/15" },
  anomaly: { label: "Anomaly", variant: "destructive", icon: AlertTriangle, accentClass: "text-destructive bg-destructive/15" },
  correlation: { label: "Correlation", variant: "secondary", icon: GitBranch, accentClass: "text-chart-3 bg-chart-3/15" },
  device_recommendation: { label: "Device Idea", variant: "outline", icon: Cpu, accentClass: "text-chart-5 bg-chart-5/15" },
};

interface InsightCardProps {
  insight: Insight;
  onStatusChange: (id: string, status: Insight["status"]) => void;
}

export function InsightCard({ insight, onStatusChange }: InsightCardProps) {
  const [yamlExpanded, setYamlExpanded] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [undeployDialogOpen, setUndeployDialogOpen] = useState(false);
  const [editableYaml, setEditableYaml] = useState(
    insight.metadata?.automationYaml ?? ""
  );
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployWarnings, setDeployWarnings] = useState<string[]>([]);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);
  const [preValidation, setPreValidation] = useState<{ missing: string[]; loading: boolean }>({ missing: [], loading: false });
  const config = TYPE_CONFIG[insight.type];
  const Icon = config.icon;
  const meta = insight.metadata;

  const isDeployed = !!meta?.deployedAutomationId;
  const hasYaml = !!meta?.automationYaml;

  // Extract entity_id references from YAML text (lightweight client-side check)
  function extractEntityIdsFromYaml(yaml: string): string[] {
    const ids = new Set<string>();
    // Match entity_id patterns: word.word (e.g., sensor.kitchen_temp)
    const regex = /\b([a-z_]+\.[a-z0-9_]+)\b/g;
    const knownDomains = new Set([
      "alarm_control_panel", "automation", "binary_sensor", "button", "calendar",
      "camera", "climate", "cover", "device_tracker", "fan", "group",
      "humidifier", "input_boolean", "input_button", "input_datetime",
      "input_number", "input_select", "input_text", "light", "lock",
      "media_player", "number", "person", "remote", "scene",
      "script", "select", "sensor", "siren", "sun", "switch", "timer",
      "update", "vacuum", "water_heater", "weather", "zone",
    ]);
    // Service-only domains — these appear after "service:" and are not entity_ids
    const serviceDomains = new Set([
      "notify", "tts", "homeassistant", "persistent_notification",
      "system_log", "logger", "recorder", "frontend",
    ]);
    let match;
    while ((match = regex.exec(yaml)) !== null) {
      const [domain] = match[1].split(".");
      if (knownDomains.has(domain) && !serviceDomains.has(domain)) {
        ids.add(match[1]);
      }
    }
    return [...ids];
  }

  // Pre-validate YAML entity references against HA states
  async function preValidateYaml(yaml: string) {
    setPreValidation({ missing: [], loading: true });
    try {
      const entityIds = extractEntityIdsFromYaml(yaml);
      if (entityIds.length === 0) {
        setPreValidation({ missing: [], loading: false });
        return;
      }
      // Fetch current HA states (entity list)
      const res = await fetch(`/api/ha/states?instanceId=${insight.instanceId}`);
      if (!res.ok) {
        setPreValidation({ missing: [], loading: false });
        return;
      }
      const states: { entity_id: string }[] = await res.json();
      const known = new Set(states.map((s) => s.entity_id));
      const missing = entityIds.filter((id) => !known.has(id));
      setPreValidation({ missing, loading: false });
    } catch {
      setPreValidation({ missing: [], loading: false });
    }
  }

  async function handleDeploy() {
    setDeploying(true);
    setDeployError(null);
    setDeployWarnings([]);
    setDeploySuccess(null);

    try {
      const res = await fetch("/api/automations/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightId: insight.id,
          instanceId: insight.instanceId,
          yamlOverride: editableYaml !== meta?.automationYaml ? editableYaml : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const details = data.details
          ? Array.isArray(data.details)
            ? data.details.join("; ")
            : data.details
          : "";
        setDeployError(`${data.error}${details ? `: ${details}` : ""}`);
        if (data.warnings) setDeployWarnings(data.warnings);
        return;
      }

      setDeploySuccess(data.automationId);
      if (data.warnings?.length) setDeployWarnings(data.warnings);
      onStatusChange(insight.id, "applied");
      // Auto-close dialog after brief success display
      setTimeout(() => setDeployDialogOpen(false), 1500);
    } catch {
      setDeployError("Network error — could not reach the server");
    } finally {
      setDeploying(false);
    }
  }

  async function handleUndeploy() {
    setDeploying(true);
    setDeployError(null);

    try {
      const res = await fetch("/api/automations/deploy", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insightId: insight.id,
          instanceId: insight.instanceId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setDeployError(data.error || "Failed to remove automation");
        return;
      }

      setUndeployDialogOpen(false);
      onStatusChange(insight.id, "viewed");
    } catch {
      setDeployError("Network error — could not reach the server");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-200 hover:glow-sm group ${
        insight.status === "new"
          ? "border-l-2"
          : insight.status === "dismissed"
            ? "opacity-50"
            : ""
      }`}
      style={insight.status === "new" ? { borderLeftColor: `var(--color-${insight.type === "anomaly" ? "destructive" : "primary"})` } : undefined}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-gradient-to-br from-primary to-transparent" />

      <CardHeader className="pb-2 relative">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${config.accentClass}`}>
              <Icon className="h-3.5 w-3.5" />
            </div>
            <Badge variant={config.variant} className="text-[10px]">{config.label}</Badge>
            {insight.status === "new" && (
              <Badge variant="default" className="text-[10px] glow-sm">NEW</Badge>
            )}
            {insight.status === "applied" && (
              <Badge variant="outline" className="text-[10px] text-primary">Applied</Badge>
            )}
            {meta?.confidence !== undefined && (
              <div className="flex items-center gap-1">
                <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary/60"
                    style={{ width: `${meta.confidence * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round(meta.confidence * 100)}%
                </span>
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {new Date(insight.createdAt).toLocaleDateString()}
          </span>
        </div>
        <CardTitle className="text-sm mt-1">{insight.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 relative">
        <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
          {insight.content}
        </p>

        {/* Anomaly details */}
        {meta?.anomalyDetails && (
          <div className="rounded-lg bg-destructive/5 border border-destructive/10 p-3 text-xs space-y-1">
            <p><span className="font-medium text-destructive">Entity:</span> <span className="font-mono">{meta.anomalyDetails.entityId}</span></p>
            <p><span className="font-medium">Expected:</span> {meta.anomalyDetails.expectedPattern}</p>
            <p><span className="font-medium">Actual:</span> {meta.anomalyDetails.actualEvent}</p>
            <p><span className="font-medium">When:</span> {new Date(meta.anomalyDetails.timestamp).toLocaleString()}</p>
          </div>
        )}

        {/* Efficiency details */}
        {meta?.efficiencyDetails && (
          <div className="rounded-lg bg-chart-2/5 border border-chart-2/10 p-3 text-xs space-y-1">
            <p><span className="font-medium">Entity:</span> <span className="font-mono">{meta.efficiencyDetails.entityId}</span></p>
            <p><span className="font-medium">Current:</span> {meta.efficiencyDetails.currentUsage}</p>
            <p><span className="font-medium">Suggestion:</span> {meta.efficiencyDetails.suggestedChange}</p>
            <p><span className="font-medium text-chart-2">Impact:</span> {meta.efficiencyDetails.estimatedImpact}</p>
          </div>
        )}

        {/* Correlation details */}
        {meta?.correlationDetails && (
          <div className="rounded-lg bg-chart-3/5 border border-chart-3/10 p-3 text-xs space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="h-3 w-3 text-chart-3" />
              <span className="font-medium text-chart-3">{meta.correlationDetails.patternType} pattern</span>
              <span className="text-muted-foreground">({meta.correlationDetails.timeWindow})</span>
            </div>
            {meta.correlationDetails.entityPairs.map((pair, i) => (
              <div key={i} className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px] font-mono">{pair.entityA}</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="text-[9px] font-mono">{pair.entityB}</Badge>
                <div className="h-1 w-8 rounded-full bg-muted overflow-hidden ml-1">
                  <div className="h-full rounded-full bg-chart-3" style={{ width: `${pair.strength * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Device recommendation details */}
        {meta?.deviceRecommendation && (
          <div className="rounded-lg bg-chart-5/5 border border-chart-5/10 p-3 text-xs space-y-1">
            <p><span className="font-medium text-chart-5">Suggested:</span> {meta.deviceRecommendation.suggestedDevice}</p>
            <p><span className="font-medium">Type:</span> <Badge variant="outline" className="text-[9px]">{meta.deviceRecommendation.deviceType}</Badge></p>
            <p><span className="font-medium">Why:</span> {meta.deviceRecommendation.rationale}</p>
            <p><span className="font-medium">Benefit:</span> {meta.deviceRecommendation.estimatedBenefit}</p>
            {meta.deviceRecommendation.enhancedEntities.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="font-medium">Enhances:</span>
                {meta.deviceRecommendation.enhancedEntities.map((eid) => (
                  <Badge key={eid} variant="outline" className="text-[9px] font-mono">{eid}</Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Automation YAML */}
        {hasYaml && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setYamlExpanded(!yamlExpanded)}
              className="text-xs border-border/50"
            >
              {yamlExpanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
              {yamlExpanded ? "Hide" : "Show"} YAML
            </Button>
            {yamlExpanded && (
              <div className="relative">
                <pre className="rounded-lg bg-muted/50 border border-border/30 p-3 text-[11px] overflow-x-auto font-mono leading-relaxed">
                  {meta!.automationYaml}
                </pre>
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-1 right-1 h-7 w-7 p-0"
                  onClick={() => navigator.clipboard.writeText(meta!.automationYaml!)}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Entity references */}
        {meta?.entityIds && meta.entityIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meta.entityIds.map((eid) => (
              <Badge key={eid} variant="outline" className="text-[9px] font-mono border-border/30">
                {eid}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          {insight.status === "new" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onStatusChange(insight.id, "viewed")}>
              <Eye className="h-3 w-3 mr-1" /> Mark Read
            </Button>
          )}
          {insight.status !== "dismissed" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onStatusChange(insight.id, "dismissed")}>
              <EyeOff className="h-3 w-3 mr-1" /> Dismiss
            </Button>
          )}
          {/* Deploy button for any type with YAML */}
          {hasYaml && !isDeployed && insight.status !== "applied" && (
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs glow-sm"
              onClick={() => {
                setEditableYaml(meta!.automationYaml!);
                setDeployError(null);
                setDeployWarnings([]);
                setDeploySuccess(null);
                setPreValidation({ missing: [], loading: false });
                setDeployDialogOpen(true);
                preValidateYaml(meta!.automationYaml!);
              }}
            >
              <Rocket className="h-3 w-3 mr-1" /> Deploy to HA
            </Button>
          )}
          {isDeployed && (
            <>
              <Badge variant="outline" className="text-[10px] text-primary glow-sm">
                <Zap className="h-3 w-3 mr-1" /> {meta?.deployedAutomationId}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive"
                onClick={() => {
                  setDeployError(null);
                  setUndeployDialogOpen(true);
                }}
              >
                Remove from HA
              </Button>
            </>
          )}
          {insight.status === "dismissed" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onStatusChange(insight.id, "new")}>
              <RotateCcw className="h-3 w-3 mr-1" /> Restore
            </Button>
          )}
        </div>

        {/* Deploy Confirmation Dialog */}
        <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto overflow-x-hidden">
            <DialogHeader>
              <DialogTitle>Deploy Automation to Home Assistant</DialogTitle>
              <DialogDescription>
                Review and optionally edit the automation YAML before deploying.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="min-w-0">
                <p className="text-sm font-medium mb-1">{insight.title}</p>
                <p className="text-sm text-muted-foreground break-words">{insight.content}</p>
              </div>

              {meta?.entityIds && meta.entityIds.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Affected Entities:</p>
                  <div className="flex flex-wrap gap-1">
                    {meta.entityIds.map((eid) => (
                      <Badge key={eid} variant="outline" className="text-[10px] font-mono max-w-full truncate">
                        {eid}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-1">Automation YAML (editable):</p>
                <textarea
                  className="w-full rounded-md border bg-muted p-3 text-xs font-mono min-h-[200px] resize-y break-all"
                  value={editableYaml}
                  onChange={(e) => setEditableYaml(e.target.value)}
                />
              </div>

              {preValidation.loading && (
                <p className="text-xs text-muted-foreground">Validating entity references…</p>
              )}

              {preValidation.missing.length > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium text-xs mb-1">
                      {preValidation.missing.length} entity{preValidation.missing.length > 1 ? " IDs" : " ID"} not found on your HA instance:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {preValidation.missing.map((eid) => (
                        <Badge key={eid} variant="outline" className="text-[10px] font-mono border-destructive/30 text-destructive max-w-full truncate">
                          {eid}
                        </Badge>
                      ))}
                    </div>
                    <p className="text-[11px] mt-1.5 text-muted-foreground">
                      Remove or replace these before deploying. Deployment will fail if invalid entities remain.
                    </p>
                  </AlertDescription>
                </Alert>
              )}

              {deployError && (
                <Alert variant="destructive">
                  <AlertDescription>{deployError}</AlertDescription>
                </Alert>
              )}

              {deployWarnings.length > 0 && (
                <Alert>
                  <AlertDescription>
                    <p className="font-medium text-xs">Warnings:</p>
                    <ul className="list-disc pl-4 text-xs">
                      {deployWarnings.map((w, i) => (
                        <li key={i}>{w}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {deploySuccess && (
                <Alert>
                  <AlertDescription className="text-xs">
                    Automation deployed successfully as <code className="font-mono">{deploySuccess}</code>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeployDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleDeploy}
                disabled={deploying || !!deploySuccess}
              >
                {deploying ? "Deploying…" : deploySuccess ? "Deployed" : "Deploy"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Undeploy Confirmation Dialog */}
        <Dialog open={undeployDialogOpen} onOpenChange={setUndeployDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Automation from Home Assistant</DialogTitle>
              <DialogDescription>
                This will delete the automation <code className="font-mono text-xs">{meta?.deployedAutomationId}</code> from your HA instance. The suggestion will be preserved.
              </DialogDescription>
            </DialogHeader>

            {deployError && (
              <Alert variant="destructive">
                <AlertDescription>{deployError}</AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setUndeployDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleUndeploy}
                disabled={deploying}
              >
                {deploying ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
