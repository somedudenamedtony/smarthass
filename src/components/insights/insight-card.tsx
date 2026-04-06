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

interface InsightMetadata {
  entityIds?: string[];
  confidence?: number;
  automationYaml?: string;
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
  const config = TYPE_CONFIG[insight.type];
  const meta = insight.metadata;

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
            insight.status !== "applied" && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onStatusChange(insight.id, "applied")}
              >
                Mark Applied
              </Button>
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
      </CardContent>
    </Card>
  );
}
