"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FileCode2,
  Download,
  Archive,
  Check,
  Clock,
  RefreshCw,
  Plus,
  Sparkles,
  Copy,
  Trash2,
} from "lucide-react";

interface Blueprint {
  id: string;
  name: string;
  description: string | null;
  domain: string;
  status: "draft" | "active" | "exported" | "archived";
  sourceEntities: string[];
  inputSchema: Record<string, unknown>;
  blueprintYaml: string;
  deployCount: number;
  exportedAt: string | null;
  createdAt: string;
}

interface HAInstance {
  id: string;
  name: string;
}

const statusConfig = {
  draft: { label: "Draft", color: "bg-warning/15 text-warning" },
  active: { label: "Active", color: "bg-success/15 text-success" },
  exported: { label: "Exported", color: "bg-primary/15 text-primary" },
  archived: { label: "Archived", color: "bg-muted text-muted-foreground" },
};

export default function BlueprintsPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);

  // Load instances
  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  // Load blueprints
  const loadBlueprints = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      const res = await fetch(`/api/blueprints?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setBlueprints(data.blueprints || []);
      }
    } catch (err) {
      console.error("Failed to load blueprints:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) {
      loadBlueprints();
    }
  }, [selectedInstance, loadBlueprints]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBlueprints();
  };

  const handleExport = async (blueprint: Blueprint) => {
    try {
      const res = await fetch("/api/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance,
          action: "export",
          blueprintId: blueprint.id,
        }),
      });
      
      if (res.ok) {
        const data = await res.json();
        // Create a download
        const blob = new Blob([data.yaml], { type: "text/yaml" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.filename || "blueprint.yaml";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Refresh to show updated status
        loadBlueprints();
      }
    } catch (err) {
      console.error("Failed to export blueprint:", err);
    }
  };

  const handleCopyYaml = async (blueprint: Blueprint) => {
    await navigator.clipboard.writeText(blueprint.blueprintYaml);
  };

  const handleDelete = async (blueprintId: string) => {
    if (!confirm("Are you sure you want to delete this blueprint?")) return;
    
    try {
      await fetch("/api/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance,
          action: "delete",
          blueprintId,
        }),
      });
      loadBlueprints();
    } catch (err) {
      console.error("Failed to delete blueprint:", err);
    }
  };

  const handleArchive = async (blueprintId: string) => {
    try {
      await fetch("/api/blueprints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance,
          action: "archive",
          blueprintId,
        }),
      });
      loadBlueprints();
    } catch (err) {
      console.error("Failed to archive blueprint:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!selectedInstance) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Blueprints</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCode2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Home Assistant instance connected</p>
            <p className="text-muted-foreground mb-4">Connect an instance to manage blueprints</p>
            <Button onClick={() => window.location.href = "/settings"}>
              Go to Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Blueprints</h1>
          <p className="text-muted-foreground">AI-generated automation blueprints</p>
        </div>
        <div className="flex items-center gap-2">
          {instances.length > 1 && (
            <select
              value={selectedInstance}
              onChange={(e) => setSelectedInstance(e.target.value)}
              className="px-3 py-2 rounded-lg border bg-background text-sm"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>{inst.name}</option>
              ))}
            </select>
          )}
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/15">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">What are Blueprints?</p>
              <p className="text-sm text-muted-foreground mt-1">
                Blueprints are reusable automation templates that SmartHass AI generates from your 
                existing automations. Export them to Home Assistant to share or reuse your automations 
                with configurable parameters.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Blueprints List */}
      {blueprints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileCode2 className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No blueprints yet</p>
            <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
              SmartHass AI will suggest blueprints based on your automation patterns. 
              Go to the Automations page to generate your first blueprint.
            </p>
            <Button onClick={() => window.location.href = "/automations"}>
              <Plus className="h-4 w-4 mr-2" />
              Go to Automations
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {blueprints.map((blueprint) => {
            const status = statusConfig[blueprint.status];
            return (
              <Card key={blueprint.id} className="card-interactive">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/15">
                        <FileCode2 className="h-4 w-4 text-primary" />
                      </div>
                      <span className="truncate">{blueprint.name}</span>
                    </CardTitle>
                    <Badge className={status.color}>{status.label}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {blueprint.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {blueprint.description}
                      </p>
                    )}
                    
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="text-xs">
                        {blueprint.domain}
                      </Badge>
                      {blueprint.sourceEntities.slice(0, 2).map((entity, i) => (
                        <Badge key={i} variant="secondary" className="text-xs font-mono">
                          {entity.split(".")[1]}
                        </Badge>
                      ))}
                      {blueprint.sourceEntities.length > 2 && (
                        <Badge variant="secondary" className="text-xs">
                          +{blueprint.sourceEntities.length - 2} more
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(blueprint.createdAt).toLocaleDateString()}
                      </span>
                      {blueprint.deployCount > 0 && (
                        <span className="flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          {blueprint.deployCount} deployments
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleExport(blueprint)}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyYaml(blueprint)}
                      >
                        <Copy className="h-4 w-4 mr-1" />
                        Copy YAML
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleArchive(blueprint.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDelete(blueprint.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Using Blueprints</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Generate:</strong> SmartHass AI creates blueprints from your automations
            </li>
            <li>
              <strong className="text-foreground">Export:</strong> Download the YAML file from this page
            </li>
            <li>
              <strong className="text-foreground">Import:</strong> In Home Assistant, go to Settings → Automations → Blueprints → Import Blueprint
            </li>
            <li>
              <strong className="text-foreground">Configure:</strong> Create new automations from the blueprint with custom parameters
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
