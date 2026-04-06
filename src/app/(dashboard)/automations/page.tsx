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

interface Automation {
  id: string;
  haAutomationId: string;
  alias: string | null;
  description: string | null;
  enabled: boolean;
  lastTriggered: string | null;
  createdAt: string;
}

interface HAInstance {
  id: string;
  name: string;
}

export default function AutomationsPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadAutomations = useCallback(async () => {
    if (!selectedInstance) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/automations?instanceId=${selectedInstance}`
      );
      if (res.ok) setAutomations(await res.json());
    } finally {
      setLoading(false);
    }
  }, [selectedInstance]);

  useEffect(() => {
    loadAutomations();
  }, [loadAutomations]);

  const enabled = automations.filter((a) => a.enabled);
  const disabled = automations.filter((a) => !a.enabled);

  if (instances.length === 0 && !loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Home Assistant instances connected.{" "}
            <a href="/settings" className="underline">
              Add one in Settings
            </a>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Automations</h1>
        {instances.length > 1 && (
          <select
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
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
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading automations…</p>
      ) : automations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No automations synced yet. Run a sync to pull automation data from
            Home Assistant.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="flex gap-4">
            <Badge variant="default">{enabled.length} enabled</Badge>
            <Badge variant="secondary">{disabled.length} disabled</Badge>
          </div>

          {/* Automation list */}
          <div className="grid gap-3">
            {automations.map((auto) => (
              <Link key={auto.id} href={`/automations/${auto.id}`}>
                <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-base">
                      {auto.alias || auto.haAutomationId}
                    </CardTitle>
                    <Badge variant={auto.enabled ? "default" : "secondary"}>
                      {auto.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      {auto.description && (
                        <span className="truncate max-w-md">
                          {auto.description}
                        </span>
                      )}
                      <span className="shrink-0">
                        Last triggered:{" "}
                        {auto.lastTriggered
                          ? new Date(auto.lastTriggered).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
