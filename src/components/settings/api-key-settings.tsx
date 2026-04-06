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
import { useToast } from "@/components/toast";

export function ApiKeySettings() {
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/api-keys");
      if (res.ok) {
        const data = await res.json();
        setHasKey(data.anthropicKey);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anthropicKey: newKey }),
      });
      if (res.ok) {
        toast("success", newKey ? "API key saved" : "API key removed");
        setHasKey(!!newKey.trim());
        setEditing(false);
        setNewKey("");
      } else {
        toast("error", "Failed to save API key");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">API Keys</h2>
        <p className="text-sm text-muted-foreground">
          Manage API keys for AI analysis features.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Anthropic API Key</CardTitle>
          <CardDescription>
            Required for AI-powered analysis, insights, and automation suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="sk-ant-..."
                autoFocus
              />
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setNewKey("");
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm">
                {hasKey ? (
                  <span className="text-green-600 dark:text-green-400">● Configured</span>
                ) : (
                  <span className="text-muted-foreground">● Not set</span>
                )}
              </span>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                {hasKey ? "Change" : "Add Key"}
              </Button>
              {hasKey && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    setNewKey("");
                    handleSave();
                  }}
                >
                  Remove
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
