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
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/components/toast";

interface HAInstance {
  id: string;
  name: string;
  url: string;
  status: "connected" | "error" | "pending";
  haVersion: string | null;
  lastSyncAt: string | null;
  createdAt: string;
}

export function HAInstances() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingInstance, setEditingInstance] = useState<HAInstance | null>(
    null
  );
  const { toast } = useToast();

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

  function handleEdit(instance: HAInstance) {
    setEditingInstance(instance);
    setDialogOpen(true);
  }

  function handleAdd() {
    setEditingInstance(null);
    setDialogOpen(true);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    setEditingInstance(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this Home Assistant connection?")) return;
    try {
      const res = await fetch("/api/ha/instances", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setInstances((prev) => prev.filter((i) => i.id !== id));
        toast("success", "Instance removed");
      } else {
        toast("error", "Failed to remove instance");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }

  async function handleSync(id: string) {
    try {
      const res = await fetch("/api/ha/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: id }),
      });
      if (res.ok) {
        toast("success", "Sync completed successfully");
        fetchInstances();
      } else {
        toast("error", "Sync failed. Check your HA connection.");
      }
    } catch {
      toast("error", "Network error. Please try again.");
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Home Assistant Instances</h2>
          <p className="text-sm text-muted-foreground">
            Connect your Home Assistant servers to start syncing data.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            onClick={handleAdd}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Add Instance
          </DialogTrigger>
          <InstanceDialog
            instance={editingInstance}
            onClose={handleDialogClose}
            onSaved={() => {
              handleDialogClose();
              fetchInstances();
              toast("success", editingInstance ? "Instance updated" : "Instance added");
            }}
          />
        </Dialog>
      </div>

      {instances.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No Home Assistant instances connected yet. Add one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              onEdit={() => handleEdit(instance)}
              onDelete={() => handleDelete(instance.id)}
              onSync={() => handleSync(instance.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: HAInstance["status"] }) {
  const variant =
    status === "connected"
      ? "default"
      : status === "error"
        ? "destructive"
        : "secondary";
  return <Badge variant={variant}>{status}</Badge>;
}

function InstanceCard({
  instance,
  onEdit,
  onDelete,
  onSync,
}: {
  instance: HAInstance;
  onEdit: () => void;
  onDelete: () => void;
  onSync: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{instance.name}</CardTitle>
          <CardDescription>{instance.url}</CardDescription>
        </div>
        <StatusBadge status={instance.status} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground space-y-0.5">
            {instance.haVersion && <p>HA Version: {instance.haVersion}</p>}
            <p>
              Last synced:{" "}
              {instance.lastSyncAt
                ? new Date(instance.lastSyncAt).toLocaleString()
                : "Never"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              Remove
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InstanceDialog({
  instance,
  onClose,
  onSaved,
}: {
  instance: HAInstance | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(instance?.name ?? "");
  const [url, setUrl] = useState(instance?.url ?? "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when instance changes
  useEffect(() => {
    setName(instance?.name ?? "");
    setUrl(instance?.url ?? "");
    setToken("");
    setError(null);
  }, [instance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      if (instance) {
        // Update existing
        const body: Record<string, string> = { id: instance.id };
        if (name !== instance.name) body.name = name;
        if (url !== instance.url) body.url = url;
        if (token) body.accessToken = token;

        const res = await fetch("/api/ha/instances", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update instance");
        }
      } else {
        // Create new
        if (!name || !url || !token) {
          setError("All fields are required.");
          setSaving(false);
          return;
        }

        const res = await fetch("/api/ha/instances", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, url, token }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to add instance");
        }
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogContent>
      <form onSubmit={handleSubmit}>
        <DialogHeader>
          <DialogTitle>
            {instance ? "Edit Instance" : "Add Home Assistant Instance"}
          </DialogTitle>
          <DialogDescription>
            {instance
              ? "Update your Home Assistant connection settings."
              : "Enter the URL and a long-lived access token for your Home Assistant instance."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="My Home"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="url">URL</Label>
            <Input
              id="url"
              type="url"
              placeholder="http://homeassistant.local:8123"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="token">
              Long-Lived Access Token
              {instance && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  (leave blank to keep current)
                </span>
              )}
            </Label>
            <Input
              id="token"
              type="password"
              placeholder={instance ? "••••••••" : "eyJ0eXAi..."}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required={!instance}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : instance ? "Update" : "Connect"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
