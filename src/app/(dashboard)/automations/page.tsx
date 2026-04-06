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
import { Zap, Clock, CheckCircle, XCircle, Plus, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const res = await fetch(
        `/api/automations?instanceId=${selectedInstance}`
      );
      if (res.ok) {
        setAutomations(await res.json());
      } else {
        setError("Failed to load automations.");
      }
    } catch {
      setError("Network error. Please check your connection.");
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
      <div className="space-y-4 animate-fade-up">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">Automations</h1>
        <Card className="border-dashed border-2">
          <CardContent className="py-16 text-center">
            <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              No Home Assistant instances connected.{" "}
              <a href="/settings" className="text-primary hover:underline">Add one in Settings</a>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-gradient">Automations</h1>
        {instances.length > 1 && (
          <select
            className="rounded-lg border border-border/50 bg-card px-3 py-1.5 text-sm"
            value={selectedInstance ?? ""}
            onChange={(e) => setSelectedInstance(e.target.value)}
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.name}</option>
            ))}
          </select>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={loadAutomations}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : automations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            No automations synced yet. Run a sync to pull automation data from
            Home Assistant.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="flex gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-lg">
              <CheckCircle className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-medium">{enabled.length} enabled</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg">
              <XCircle className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">{disabled.length} disabled</span>
            </div>
          </div>

          {/* Automation list */}
          <div className="grid gap-3">
            {automations.map((auto) => (
              <Link key={auto.id} href={`/automations/${auto.id}`}>
                <Card className="group hover:border-primary/30 transition-all cursor-pointer overflow-hidden relative">
                  {auto.enabled && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                  )}
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-1.5 rounded-md ${auto.enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        <Zap className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-base group-hover:text-primary transition-colors">
                        {auto.alias || auto.haAutomationId}
                      </CardTitle>
                    </div>
                    <Badge
                      variant={auto.enabled ? "default" : "secondary"}
                      className={auto.enabled ? "glow-sm" : ""}
                    >
                      {auto.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground pl-9">
                      {auto.description && (
                        <span className="truncate max-w-md">
                          {auto.description}
                        </span>
                      )}
                      <span className="shrink-0 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {auto.lastTriggered
                          ? new Date(auto.lastTriggered).toLocaleString()
                          : "Never triggered"}
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
