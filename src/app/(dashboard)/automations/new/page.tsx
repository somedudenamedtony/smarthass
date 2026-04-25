"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Wand2,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface HAInstance {
  id: string;
  name: string;
}

interface EntityInfo {
  entityId: string;
  domain: string;
  friendlyName: string | null;
}

type Step = "intent" | "entities" | "conditions" | "review";

interface GeneratedAutomation {
  automationConfig: Record<string, unknown>;
  automationYaml: string;
  explanation: string;
  requiredEntities: string[];
  missingEntities: string[];
  warnings: string[];
  confidence: number;
}

export default function AutomationBuilderPage() {
  const router = useRouter();
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [entities, setEntities] = useState<EntityInfo[]>([]);
  const [step, setStep] = useState<Step>("intent");
  const [loading, setLoading] = useState(true);

  // Form state
  const [intent, setIntent] = useState("");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [entitySearch, setEntitySearch] = useState("");
  const [conditions, setConditions] = useState<string[]>([""]);

  // Result state
  const [result, setResult] = useState<GeneratedAutomation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadEntities = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      const res = await fetch(`/api/entities?instanceId=${selectedInstance}&limit=2000`);
      if (res.ok) {
        const data = await res.json();
        setEntities(data.entities || []);
      }
    } catch {}
    setLoading(false);
  }, [selectedInstance]);

  useEffect(() => {
    if (selectedInstance) loadEntities();
  }, [selectedInstance, loadEntities]);

  const filteredEntities = entities.filter((e) => {
    const q = entitySearch.toLowerCase();
    return e.entityId.toLowerCase().includes(q) || e.friendlyName?.toLowerCase().includes(q);
  });

  function toggleEntity(entityId: string) {
    setSelectedEntities((prev) =>
      prev.includes(entityId) ? prev.filter((e) => e !== entityId) : [...prev, entityId]
    );
  }

  function addCondition() {
    setConditions((prev) => [...prev, ""]);
  }

  function updateCondition(index: number, value: string) {
    setConditions((prev) => prev.map((c, i) => (i === index ? value : c)));
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  async function generate() {
    if (!selectedInstance || !intent.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/automations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instanceId: selectedInstance,
          intent: intent.trim(),
          selectedEntities: selectedEntities.length > 0 ? selectedEntities : undefined,
          conditions: conditions.filter((c) => c.trim()),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setStep("review");
      } else {
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Network error");
    }
    setGenerating(false);
  }

  async function copyYaml() {
    if (result?.automationYaml) {
      await navigator.clipboard.writeText(result.automationYaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "intent", label: "Describe" },
    { key: "entities", label: "Entities" },
    { key: "conditions", label: "Conditions" },
    { key: "review", label: "Review" },
  ];

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <button
          onClick={() => router.push("/automations")}
          className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> Back to automations
        </button>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Wand2 className="h-6 w-6 text-primary" />
          Automation Builder
        </h1>
        <p className="text-muted-foreground">Describe what you want and AI will generate the YAML</p>
      </div>

      {/* Instance selector */}
      {instances.length > 1 && (
        <select
          value={selectedInstance || ""}
          onChange={(e) => setSelectedInstance(e.target.value)}
          className="px-3 py-2 rounded-lg border bg-background text-sm w-full"
        >
          {instances.map((inst) => (
            <option key={inst.id} value={inst.id}>{inst.name}</option>
          ))}
        </select>
      )}

      {/* Step Progress */}
      <div className="flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <button
              onClick={() => { if (i < stepIndex || (i === 3 && result)) setStep(s.key); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
                step === s.key
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-background/20 flex items-center justify-center text-[10px]">
                {i < stepIndex ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-destructive text-sm">{error}</CardContent>
        </Card>
      )}

      {/* Step 1: Intent */}
      {step === "intent" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">What do you want to automate?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              placeholder="e.g., Turn on the living room lights at sunset, but only if someone is home. Dim them to 30% after 11 PM."
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="w-full h-32 rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="text-xs text-muted-foreground">
              <p className="font-medium mb-1">Tips for better results:</p>
              <ul className="list-disc list-inside space-y-0.5">
                <li>Be specific about which devices or rooms</li>
                <li>Mention time conditions, triggers, and desired actions</li>
                <li>Include any exceptions or special cases</li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep("entities")} disabled={!intent.trim()}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Entity Selection */}
      {step === "entities" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Select entities (optional)</CardTitle>
            <p className="text-sm text-muted-foreground">Pick specific entities to use, or skip to let AI choose</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search entities..."
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
            />
            {selectedEntities.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedEntities.map((eid) => (
                  <Badge key={eid} variant="secondary" className="cursor-pointer hover:bg-destructive/20" onClick={() => toggleEntity(eid)}>
                    {eid} ×
                  </Badge>
                ))}
              </div>
            )}
            <div className="max-h-64 overflow-y-auto border rounded-lg">
              {filteredEntities.slice(0, 100).map((e) => (
                <button
                  key={e.entityId}
                  onClick={() => toggleEntity(e.entityId)}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-muted/50 flex items-center justify-between ${
                    selectedEntities.includes(e.entityId) ? "bg-primary/10" : ""
                  }`}
                >
                  <div>
                    <span className="font-medium">{e.friendlyName || e.entityId}</span>
                    <span className="text-xs text-muted-foreground ml-2">{e.entityId}</span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">{e.domain}</Badge>
                </button>
              ))}
              {filteredEntities.length > 100 && (
                <p className="text-xs text-muted-foreground p-2 text-center">Showing 100 of {filteredEntities.length}. Narrow your search.</p>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("intent")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => setStep("conditions")}>
                {selectedEntities.length > 0 ? "Next" : "Skip"} <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Conditions */}
      {step === "conditions" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional conditions (optional)</CardTitle>
            <p className="text-sm text-muted-foreground">Add constraints or conditions in plain language</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {conditions.map((cond, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder={`e.g., Only when sun is below horizon${i > 0 ? ", Only on weekdays" : ""}`}
                  value={cond}
                  onChange={(e) => updateCondition(i, e.target.value)}
                />
                {conditions.length > 1 && (
                  <Button variant="ghost" size="icon" onClick={() => removeCondition(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addCondition}>
              <Plus className="h-4 w-4 mr-1" /> Add condition
            </Button>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("entities")}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={generate} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-1" />
                    Generate Automation
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Review */}
      {step === "review" && result && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Generated Automation</CardTitle>
                <Badge variant={result.confidence >= 0.8 ? "default" : "secondary"}>
                  {Math.round(result.confidence * 100)}% confidence
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{result.explanation}</p>

              {result.warnings.length > 0 && (
                <div className="space-y-1">
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.missingEntities.length > 0 && (
                <div className="bg-destructive/10 rounded-lg p-3">
                  <p className="text-xs font-medium text-destructive mb-1">Missing entities</p>
                  <div className="flex flex-wrap gap-1">
                    {result.missingEntities.map((e) => (
                      <Badge key={e} variant="destructive" className="text-xs">{e}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Automation YAML</CardTitle>
                <Button variant="outline" size="sm" onClick={copyYaml}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                <code>{result.automationYaml}</code>
              </pre>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => { setResult(null); setStep("intent"); }}>
              Start Over
            </Button>
            <Button variant="outline" onClick={() => { setResult(null); setStep("conditions"); }}>
              Adjust & Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
