"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BookTemplate,
  Loader2,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

interface HAInstance {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  useCase: string | null;
  requiredDomains: string[];
  optionalDomains: string[];
  templateYaml: string | null;
  inputSchema: Record<string, unknown> | null;
  exampleConfig: Record<string, unknown> | null;
  isCurated: boolean;
  matchScore?: number;
  canDeploy?: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  morning_routine: "bg-amber-500/10 text-amber-500",
  away_mode: "bg-purple-500/10 text-purple-500",
  comfort: "bg-pink-500/10 text-pink-500",
  security: "bg-red-500/10 text-red-500",
  energy_saving: "bg-green-500/10 text-green-500",
  convenience: "bg-blue-500/10 text-blue-500",
  entertainment: "bg-indigo-500/10 text-indigo-500",
  climate: "bg-cyan-500/10 text-cyan-500",
  lighting: "bg-yellow-500/10 text-yellow-500",
  notifications: "bg-orange-500/10 text-orange-500",
};

export default function TemplatesPage() {
  const [instances, setInstances] = useState<HAInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ha/instances")
      .then((r) => r.json())
      .then((list: HAInstance[]) => {
        setInstances(list);
        if (list.length > 0) setSelectedInstance(list[0].id);
        else setLoading(false);
      });
  }, []);

  const loadTemplates = useCallback(async () => {
    if (!selectedInstance) return;
    try {
      const params = new URLSearchParams({ instanceId: selectedInstance });
      if (selectedCategory) params.set("category", selectedCategory);
      const res = await fetch(`/api/templates?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data.templates || []);
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
    setLoading(false);
  }, [selectedInstance, selectedCategory]);

  useEffect(() => {
    if (selectedInstance) loadTemplates();
  }, [selectedInstance, loadTemplates]);

  async function generateTemplates() {
    if (!selectedInstance) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", instanceId: selectedInstance }),
      });
      if (res.ok) {
        await loadTemplates();
      }
    } catch (err) {
      console.error("Generation failed:", err);
    }
    setGenerating(false);
  }

  async function deleteTemplate(templateId: string) {
    if (!selectedInstance) return;
    try {
      await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", instanceId: selectedInstance, templateId }),
      });
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  async function copyYaml(template: Template) {
    if (template.templateYaml) {
      await navigator.clipboard.writeText(template.templateYaml);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const displayed = selectedCategory
    ? templates.filter((t) => t.category === selectedCategory)
    : templates;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BookTemplate className="h-6 w-6 text-primary" />
            Automation Templates
          </h1>
          <p className="text-muted-foreground">Pre-built automations tailored to your setup</p>
        </div>
        <div className="flex items-center gap-2">
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
          <Button onClick={generateTemplates} disabled={generating}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1" />
                Generate Templates
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Category Filter */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              !selectedCategory ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All ({templates.length})
          </button>
          {categories.map((cat) => {
            const count = templates.filter((t) => t.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {cat.replace(/_/g, " ")} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Templates */}
      {displayed.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookTemplate className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No templates yet</p>
            <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
              Click &quot;Generate Templates&quot; to create personalized automation templates based on your entity setup.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayed.map((template) => (
            <Card
              key={template.id}
              className={`cursor-pointer transition hover:border-primary/50 ${expanded === template.id ? "md:col-span-2 lg:col-span-3" : ""}`}
              onClick={() => setExpanded(expanded === template.id ? null : template.id)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      {template.name}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={`text-[10px] ${CATEGORY_COLORS[template.category] || "bg-muted text-muted-foreground"}`}>
                        {template.category.replace(/_/g, " ")}
                      </Badge>
                      {template.isCurated && (
                        <Badge variant="outline" className="text-[10px]">curated</Badge>
                      )}
                    </div>
                  </div>
                  {template.matchScore != null && (
                    <div className="flex flex-col items-center">
                      <span className={`text-lg font-bold ${
                        template.matchScore >= 80 ? "text-success" :
                        template.matchScore >= 50 ? "text-warning" :
                        "text-destructive"
                      }`}>
                        {template.matchScore}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">match</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground line-clamp-2">{template.description}</p>

                {template.canDeploy === false && (
                  <div className="flex items-center gap-1.5 text-xs text-warning">
                    <AlertTriangle className="h-3 w-3" />
                    Missing required entity domains
                  </div>
                )}

                {/* Required Domains */}
                <div className="flex flex-wrap gap-1">
                  {template.requiredDomains.map((d) => (
                    <Badge key={d} variant="outline" className="text-[10px]">{d}</Badge>
                  ))}
                </div>

                {/* Expanded content */}
                {expanded === template.id && (
                  <div className="space-y-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                    {template.useCase && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Use Case</p>
                        <p className="text-sm">{template.useCase}</p>
                      </div>
                    )}
                    {template.templateYaml && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-medium text-muted-foreground">Automation YAML</p>
                          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyYaml(template)}>
                            {copiedId === template.id ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                            <span className="text-xs">{copiedId === template.id ? "Copied" : "Copy"}</span>
                          </Button>
                        </div>
                        <pre className="bg-muted rounded-lg p-3 text-xs overflow-x-auto max-h-60 overflow-y-auto">
                          <code>{template.templateYaml}</code>
                        </pre>
                      </div>
                    )}
                    {!template.isCurated && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteTemplate(template.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
