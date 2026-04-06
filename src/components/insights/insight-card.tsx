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
  category?: string;
}

export interface Insight {
  id: string;
  instanceId: string;
  type: "insight" | "suggestion" | "automation" | "anomaly";
  title: string;
  content: string;
  metadata: InsightMetadata | null;
  status: "new" | "viewed" | "dismissed" | "applied";
  createdAt: string;
}

const TYPE_CONFIG: Record<
  Insight["type"],
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  insight: { label: "Pattern", variant: "default" },
  suggestion: { label: "Suggestion", variant: "secondary" },
  automation: { label: "Automation", variant: "outline" },
  anomaly: { label: "Anomaly", variant: "destructive" },
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
  const config = TYPE_CONFIG[insight.type];
  const meta = insight.metadata;

  const isDeployed = !!meta?.deployedAutomationId;

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
      // Update parent state
      onStatusChange(insight.id, "applied");
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
      className={
        insight.status === "new"
          ? "border-l-4 border-l-primary"
          : insight.status === "dismissed"
            ? "opacity-60"
            : ""
      }
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={config.variant}>{config.label}</Badge>
            {insight.status === "new" && (
              <Badge variant="default" className="text-[10px]">
                NEW
              </Badge>
            )}
            {insight.status === "applied" && (
              <Badge variant="outline" className="text-[10px]">
                Applied
              </Badge>
            )}
            {meta?.confidence !== undefined && (
              <span className="text-xs text-muted-foreground">
                {Math.round(meta.confidence * 100)}% confidence
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {new Date(insight.createdAt).toLocaleDateString()}
          </span>
        </div>
        <CardTitle className="text-sm mt-1">{insight.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground whitespace-pre-line">
          {insight.content}
        </p>

        {/* Anomaly details */}
        {meta?.anomalyDetails && (
          <div className="rounded-md bg-destructive/5 p-3 text-xs space-y-1">
            <p>
              <span className="font-medium">Entity:</span>{" "}
              {meta.anomalyDetails.entityId}
            </p>
            <p>
              <span className="font-medium">Expected:</span>{" "}
              {meta.anomalyDetails.expectedPattern}
            </p>
            <p>
              <span className="font-medium">Actual:</span>{" "}
              {meta.anomalyDetails.actualEvent}
            </p>
            <p>
              <span className="font-medium">When:</span>{" "}
              {new Date(meta.anomalyDetails.timestamp).toLocaleString()}
            </p>
          </div>
        )}

        {/* Efficiency details */}
        {meta?.efficiencyDetails && (
          <div className="rounded-md bg-muted p-3 text-xs space-y-1">
            <p>
              <span className="font-medium">Entity:</span>{" "}
              {meta.efficiencyDetails.entityId}
            </p>
            <p>
              <span className="font-medium">Current:</span>{" "}
              {meta.efficiencyDetails.currentUsage}
            </p>
            <p>
              <span className="font-medium">Suggestion:</span>{" "}
              {meta.efficiencyDetails.suggestedChange}
            </p>
            <p>
              <span className="font-medium">Impact:</span>{" "}
              {meta.efficiencyDetails.estimatedImpact}
            </p>
          </div>
        )}

        {/* Automation YAML */}
        {meta?.automationYaml && (
          <div className="space-y-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setYamlExpanded(!yamlExpanded)}
            >
              {yamlExpanded ? "Hide" : "Show"} Automation YAML
            </Button>
            {yamlExpanded && (
              <div className="relative">
                <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto font-mono">
                  {meta.automationYaml}
                </pre>
                <Button
                  variant="ghost"
                  size="xs"
                  className="absolute top-1 right-1"
                  onClick={() => {
                    navigator.clipboard.writeText(meta.automationYaml!);
                  }}
                >
                  Copy
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Entity references */}
        {meta?.entityIds && meta.entityIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {meta.entityIds.map((eid) => (
              <Badge key={eid} variant="outline" className="text-[10px] font-mono">
                {eid}
              </Badge>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {insight.status === "new" && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onStatusChange(insight.id, "viewed")}
            >
              Mark Read
            </Button>
          )}
          {insight.status !== "dismissed" && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onStatusChange(insight.id, "dismissed")}
            >
              Dismiss
            </Button>
          )}
          {insight.type === "automation" &&
            meta?.automationYaml &&
            !isDeployed &&
            insight.status !== "applied" && (
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  setEditableYaml(meta.automationYaml!);
                  setDeployError(null);
                  setDeployWarnings([]);
                  setDeploySuccess(null);
                  setDeployDialogOpen(true);
                }}
              >
                Deploy to HA
              </Button>
            )}
          {isDeployed && (
            <>
              <Badge variant="outline" className="text-[10px]">
                Deployed: {meta?.deployedAutomationId}
              </Badge>
              <Button
                variant="ghost"
                size="xs"
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
            <Button
              variant="ghost"
              size="xs"
              onClick={() => onStatusChange(insight.id, "new")}
            >
              Restore
            </Button>
          )}
        </div>

        {/* Deploy Confirmation Dialog */}
        <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Deploy Automation to Home Assistant</DialogTitle>
              <DialogDescription>
                Review and optionally edit the automation YAML before deploying.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-1">{insight.title}</p>
                <p className="text-sm text-muted-foreground">{insight.content}</p>
              </div>

              {meta?.entityIds && meta.entityIds.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Affected Entities:</p>
                  <div className="flex flex-wrap gap-1">
                    {meta.entityIds.map((eid) => (
                      <Badge key={eid} variant="outline" className="text-[10px] font-mono">
                        {eid}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-medium mb-1">Automation YAML (editable):</p>
                <textarea
                  className="w-full rounded-md border bg-muted p-3 text-xs font-mono min-h-[200px] resize-y"
                  value={editableYaml}
                  onChange={(e) => setEditableYaml(e.target.value)}
                />
              </div>

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
