"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FlaskConical,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Shield,
} from "lucide-react";

interface HAInstance {
  id: string;
  name: string;
}

interface AutomationAffected {
  automationId: string;
  name: string;
  impactType: string;
  description: string;
}

interface EntityAffected {
  entityId: string;
  currentState: string;
  predictedState: string;
  reason: string;
}

interface SimResult {
  scenario: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  automationsAffected: AutomationAffected[];
  entitiesAffected: EntityAffected[];
  newOpportunities: string[];
  recommendations: string[];
}

const RISK_CONFIG: Record<string, { color: string; bg: string; icon: typeof Shield }> = {
  low: { color: "text-success", bg: "bg-success/10", icon: Shield },
  medium: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Info },
  high: { color: "text-warning", bg: "bg-warning/10", icon: AlertTriangle },
  critical: { color: "text-destructive", bg: "bg-destructive/10", icon: ShieldAlert },
};

const EXAMPLE_SCENARIOS = [
  "What happens if the internet goes down?",
  "What if I add a motion sensor to the kitchen?",
  "What happens if the temperature drops below 0°C outside?",
  "What if the power goes out for 2 hours?",
  "What happens when everyone leaves the house?",
  "What if I disable the living room light automation?",
];

export default function SimulatorPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [scenario, setScenario] = useState("");
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SimResult[]>([]);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        setLoading(false);
      });
  }, []);

  const simulate = useCallback(async (scenarioText?: string) => {
    const text = scenarioText || scenario;
    if (!selectedInstance || !text.trim()) return;
    setSimulating(true);
    setError(null);
    try {
      const res = await fetch("/api/simulator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId: selectedInstance, scenario: text.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setHistory((prev) => [data, ...prev].slice(0, 10));
      } else {
        setError(data.error || "Simulation failed");
      }
    } catch {
      setError("Network error");
    }
    setSimulating(false);
  }, [selectedInstance, scenario]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-primary" />
            What-If Simulator
          </h1>
          <p className="text-muted-foreground">Simulate scenarios to predict how your home will react</p>
        </div>
        {instances.length > 1 && (
          <select
            value={selectedInstance || ""}
            onChange={(e) => setSelectedInstance(e.target.value)}
            className="px-3 py-2 rounded-lg border bg-background text-sm"
          >
            {instances.map((inst) => (
              <option key={inst.id} value={inst.id}>{inst.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Scenario Input */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <textarea
            placeholder="Describe a scenario... e.g., 'What happens if the internet goes down?'"
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            className="w-full h-24 rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); simulate(); } }}
          />
          <div className="flex items-center justify-between">
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_SCENARIOS.slice(0, 3).map((ex) => (
                <button
                  key={ex}
                  onClick={() => { setScenario(ex); simulate(ex); }}
                  className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/80 transition"
                >
                  {ex}
                </button>
              ))}
            </div>
            <Button onClick={() => simulate()} disabled={simulating || !scenario.trim()}>
              {simulating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Simulating…
                </>
              ) : (
                <>
                  <FlaskConical className="h-4 w-4 mr-1" />
                  Simulate
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-4">
          {/* Risk Level + Summary */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Simulation Result</CardTitle>
                {(() => {
                  const config = RISK_CONFIG[result.riskLevel] || RISK_CONFIG.medium;
                  const Icon = config.icon;
                  return (
                    <Badge className={`${config.bg} ${config.color} border-0`}>
                      <Icon className="h-3 w-3 mr-1" />
                      {result.riskLevel.toUpperCase()} RISK
                    </Badge>
                  );
                })()}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground italic mb-4">&quot;{result.scenario}&quot;</p>
              <p className="text-sm">{result.summary}</p>
            </CardContent>
          </Card>

          {/* Automations Affected */}
          {result.automationsAffected.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Automations Affected ({result.automationsAffected.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {result.automationsAffected.map((a, i) => (
                  <div key={i} className="border rounded-lg p-3 flex items-start gap-3">
                    <Badge variant={a.impactType === "broken" ? "destructive" : a.impactType === "degraded" ? "secondary" : "outline"} className="text-xs mt-0.5 shrink-0">
                      {a.impactType}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Entities Affected */}
          {result.entitiesAffected.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Entity State Changes ({result.entitiesAffected.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.entitiesAffected.map((e, i) => (
                    <div key={i} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{e.entityId}</span>
                        <span className="text-xs text-muted-foreground">{e.currentState}</span>
                        <span className="text-muted-foreground">→</span>
                        <Badge variant="secondary" className="text-xs">{e.predictedState}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{e.reason}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Opportunities & Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {result.newOpportunities.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {result.newOpportunities.map((o, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-success">•</span>
                        {o}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {result.recommendations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-4 w-4 text-blue-500" />
                    Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {result.recommendations.map((r, i) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-blue-500">•</span>
                        {r}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Simulations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.slice(1).map((h, i) => {
              const config = RISK_CONFIG[h.riskLevel] || RISK_CONFIG.medium;
              return (
                <button
                  key={i}
                  onClick={() => setResult(h)}
                  className="w-full text-left border rounded-lg p-3 hover:bg-muted/50 transition"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm truncate">{h.scenario}</p>
                    <Badge variant="outline" className={`text-xs ${config.color}`}>{h.riskLevel}</Badge>
                  </div>
                </button>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
