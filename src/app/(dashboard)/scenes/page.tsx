"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Play,
  Clock,
  FileCode,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface Scene {
  id: string;
  entityId: string;
  name: string;
  icon: string | null;
  areaId: string | null;
  lastActivated: string | null;
  activationCount: number;
}

interface Script {
  id: string;
  entityId: string;
  name: string;
  icon: string | null;
  description: string | null;
  mode: string | null;
  lastTriggered: string | null;
  triggerCount: number;
}

interface HAInstance {
  id: string;
  name: string;
}

export default function ScenesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"scenes" | "scripts">("scenes");

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

  // Load scenes and scripts
  const loadData = useCallback(async () => {
    if (!selectedInstance) return;
    
    try {
      const res = await fetch(`/api/scenes?instanceId=${selectedInstance}`);
      if (res.ok) {
        const data = await res.json();
        setScenes(data.scenes || []);
        setScripts(data.scripts || []);
      }
    } catch (err) {
      console.error("Failed to load scenes/scripts:", err);
    }
    setLoading(false);
    setRefreshing(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) {
      loadData();
    }
  }, [selectedInstance, loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
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
        <h1 className="text-2xl font-semibold">Scenes & Scripts</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">No Home Assistant instance connected</p>
            <p className="text-muted-foreground mb-4">Connect an instance to view scenes and scripts</p>
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
          <h1 className="text-2xl font-semibold">Scenes & Scripts</h1>
          <p className="text-muted-foreground">Manage your Home Assistant scenes and scripts</p>
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

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("scenes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "scenes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Layers className="h-4 w-4 inline mr-2" />
          Scenes ({scenes.length})
        </button>
        <button
          onClick={() => setActiveTab("scripts")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "scripts"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <FileCode className="h-4 w-4 inline mr-2" />
          Scripts ({scripts.length})
        </button>
      </div>

      {/* Scenes Tab */}
      {activeTab === "scenes" && (
        <>
          {scenes.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No scenes found</p>
                <p className="text-muted-foreground text-sm text-center max-w-md">
                  Create scenes in Home Assistant to control multiple entities at once.
                  Scenes will appear here after syncing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenes.map((scene) => (
                <Card key={scene.id} className="card-interactive">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-success/15">
                          <Layers className="h-4 w-4 text-success" />
                        </div>
                        <span className="truncate">{scene.name}</span>
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {scene.activationCount} uses
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground font-mono text-xs truncate">
                        {scene.entityId}
                      </p>
                      {scene.areaId && (
                        <p className="text-muted-foreground text-xs">
                          Area: {scene.areaId}
                        </p>
                      )}
                      {scene.lastActivated && (
                        <p className="text-muted-foreground text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last used: {new Date(scene.lastActivated).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* Scripts Tab */}
      {activeTab === "scripts" && (
        <>
          {scripts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileCode className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium mb-2">No scripts found</p>
                <p className="text-muted-foreground text-sm text-center max-w-md">
                  Create scripts in Home Assistant to automate sequences of actions.
                  Scripts will appear here after syncing.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scripts.map((script) => (
                <Card key={script.id} className="card-interactive">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <div className="p-2 rounded-lg bg-primary/15">
                          <FileCode className="h-4 w-4 text-primary" />
                        </div>
                        <span className="truncate">{script.name}</span>
                      </CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {script.triggerCount} runs
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="text-muted-foreground font-mono text-xs truncate">
                        {script.entityId}
                      </p>
                      {script.description && (
                        <p className="text-muted-foreground text-xs line-clamp-2">
                          {script.description}
                        </p>
                      )}
                      {script.mode && (
                        <Badge variant="outline" className="text-xs">
                          Mode: {script.mode}
                        </Badge>
                      )}
                      {script.lastTriggered && (
                        <p className="text-muted-foreground text-xs flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Last run: {new Date(script.lastTriggered).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* AI Suggestions Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Scene Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            SmartHass AI can analyze your usage patterns to suggest new scenes that group 
            commonly-used entities together.
          </p>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/insights"}>
            View AI Insights →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
