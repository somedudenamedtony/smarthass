"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

interface HAInstance {
  id: string;
  name: string;
  analysisWindowDays?: number;
}

const WINDOW_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

export function AnalysisSettings() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    try {
      const res = await fetch("/api/ha/instances");
      if (res.ok) {
        setInstances(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  async function handleWindowChange(instanceId: string, days: number) {
    setSaving(instanceId);
    try {
      const res = await fetch("/api/ha/instances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: instanceId, analysisWindowDays: days }),
      });
      if (res.ok) {
        setInstances((prev) =>
          prev.map((i) =>
            i.id === instanceId ? { ...i, analysisWindowDays: days } : i
          )
        );
      }
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  if (instances.length === 0) return null;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Analysis Settings</h2>
        <p className="text-sm text-muted-foreground">
          Configure how AI analysis processes your Home Assistant data.
        </p>
      </div>

      <div className="grid gap-4">
        {instances.map((instance) => (
          <Card key={instance.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{instance.name}</CardTitle>
              <CardDescription>
                How many days of data to include in each AI analysis run.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Label className="text-sm whitespace-nowrap">
                  Analysis Window
                </Label>
                <div className="flex gap-2">
                  {WINDOW_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={
                        (instance.analysisWindowDays ?? 14) === opt.value
                          ? "default"
                          : "outline"
                      }
                      size="sm"
                      disabled={saving === instance.id}
                      onClick={() =>
                        handleWindowChange(instance.id, opt.value)
                      }
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
