"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface AutomationDetail {
  id: string;
  instanceId: string;
  haAutomationId: string;
  alias: string | null;
  description: string | null;
  triggerConfig: unknown;
  conditionConfig: unknown;
  actionConfig: unknown;
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
}

export default function AutomationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [automation, setAutomation] = useState<AutomationDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/automations/${id}`);
        if (res.ok) setAutomation(await res.json());
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading automation…</p>;
  }

  if (!automation) {
    return (
      <div className="space-y-4">
        <Link
          href="/automations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to automations
        </Link>
        <p>Automation not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/automations"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to automations
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {automation.alias || automation.haAutomationId}
          </h1>
          {automation.description && (
            <p className="text-muted-foreground mt-1">
              {automation.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground font-mono mt-1">
            {automation.haAutomationId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/automations/${id}/review`}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
          >
            Review with AI
          </Link>
          <Badge variant={automation.enabled ? "default" : "secondary"}>
            {automation.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Last triggered:{" "}
        {automation.lastTriggered
          ? new Date(automation.lastTriggered).toLocaleString()
          : "Never"}
      </div>

      <Separator />

      {/* Trigger */}
      <ConfigSection
        title="Triggers"
        description="What starts this automation"
        config={automation.triggerConfig}
      />

      {/* Conditions */}
      <ConfigSection
        title="Conditions"
        description="What must be true for it to run"
        config={automation.conditionConfig}
      />

      {/* Actions */}
      <ConfigSection
        title="Actions"
        description="What happens when it runs"
        config={automation.actionConfig}
      />
    </div>
  );
}

function ConfigSection({
  title,
  description,
  config,
}: {
  title: string;
  description: string;
  config: unknown;
}) {
  if (!config) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No {title.toLowerCase()} configured
          </p>
        </CardContent>
      </Card>
    );
  }

  const items = Array.isArray(config) ? config : [config];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, i) => (
          <pre
            key={i}
            className="rounded-md bg-muted p-3 text-xs overflow-x-auto"
          >
            {JSON.stringify(item, null, 2)}
          </pre>
        ))}
      </CardContent>
    </Card>
  );
}
