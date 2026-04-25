"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  ArrowLeft,
  Loader2,
  Copy,
  Check,
} from "lucide-react";

interface Finding {
  severity: "critical" | "warning" | "info" | "positive";
  category: string;
  title: string;
  description: string;
  suggestion: string;
}

interface Review {
  id: string;
  healthScore: number;
  summary: string | null;
  findings: Finding[];
  improvedYaml: string | null;
  tokensUsed: number;
  createdAt: string;
}

const SEVERITY_CONFIG: Record<string, { icon: typeof AlertTriangle; color: string; bg: string; label: string }> = {
  critical: { icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10", label: "Critical" },
  warning: { icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10", label: "Warning" },
  info: { icon: Info, color: "text-blue-500", bg: "bg-blue-500/10", label: "Info" },
  positive: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "Good" },
};

function getScoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 50) return "text-warning";
  return "text-destructive";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Poor";
  return "Critical";
}

export default function AutomationReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);
  const [cached, setCached] = useState(false);
  const [automationName, setAutomationName] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load automation name
  useEffect(() => {
    fetch(`/api/automations/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setAutomationName(data.alias || data.haAutomationId || "Automation");
      })
      .catch(() => {});
  }, [id]);

  // Load cached review
  useEffect(() => {
    async function loadReview() {
      try {
        const res = await fetch(`/api/automations/${id}/review`);
        if (res.ok) {
          const data = await res.json();
          if (data.review) {
            setReview(data.review);
            setCached(true);
          }
        }
      } catch {
        // No cached review, that's fine
      }
      setLoading(false);
    }
    loadReview();
  }, [id]);

  async function runReview() {
    setReviewing(true);
    setError(null);
    try {
      const res = await fetch(`/api/automations/${id}/review`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setReview(data.review);
        setCached(data.cached);
      } else {
        setError(data.error || "Review failed");
      }
    } catch {
      setError("Network error");
    }
    setReviewing(false);
  }

  async function copyYaml() {
    if (review?.improvedYaml) {
      await navigator.clipboard.writeText(review.improvedYaml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/automations" className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-2">
            <ArrowLeft className="h-3 w-3" /> Back to automations
          </Link>
          <h1 className="text-2xl font-semibold">Review: {automationName}</h1>
          <p className="text-muted-foreground">AI-powered automation code review</p>
        </div>
        <Button onClick={runReview} disabled={reviewing}>
          {reviewing ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Reviewing…
            </>
          ) : review ? (
            "Re-Review"
          ) : (
            "Start Review"
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {!review && !reviewing && (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Shield className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <p className="text-lg font-medium mb-2">No review yet</p>
            <p className="text-muted-foreground text-sm text-center max-w-md mb-4">
              Click &quot;Start Review&quot; to have AI analyze this automation for reliability, optimization, and security issues.
            </p>
          </CardContent>
        </Card>
      )}

      {review && (
        <>
          {/* Health Score */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-1">
              <CardContent className="pt-6 flex flex-col items-center justify-center">
                <div className={`text-6xl font-bold ${getScoreColor(review.healthScore)}`}>
                  {review.healthScore}
                </div>
                <p className={`text-lg font-medium ${getScoreColor(review.healthScore)}`}>
                  {getScoreLabel(review.healthScore)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Health Score</p>
                {cached && (
                  <Badge variant="outline" className="mt-2 text-xs">
                    Cached result
                  </Badge>
                )}
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{review.summary}</p>
                <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
                  <span>{(review.findings as Finding[]).filter((f) => f.severity === "critical").length} critical</span>
                  <span>{(review.findings as Finding[]).filter((f) => f.severity === "warning").length} warnings</span>
                  <span>{(review.findings as Finding[]).filter((f) => f.severity === "info").length} info</span>
                  <span>{(review.findings as Finding[]).filter((f) => f.severity === "positive").length} positive</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Findings */}
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Findings ({(review.findings as Finding[]).length})</h2>
            {(review.findings as Finding[]).map((finding, i) => {
              const config = SEVERITY_CONFIG[finding.severity] || SEVERITY_CONFIG.info;
              const Icon = config.icon;
              return (
                <Card key={i} className="overflow-hidden">
                  <div className={`h-1 ${finding.severity === "critical" ? "bg-destructive" : finding.severity === "warning" ? "bg-warning" : finding.severity === "positive" ? "bg-success" : "bg-blue-500"}`} />
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg shrink-0 ${config.bg}`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{finding.title}</p>
                          <Badge variant="outline" className="text-[10px]">{finding.category}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{finding.description}</p>
                        {finding.suggestion && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-xs font-medium text-primary mb-1">Suggestion</p>
                            <p className="text-sm text-muted-foreground">{finding.suggestion}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Improved YAML */}
          {review.improvedYaml && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Improved Automation</CardTitle>
                  <Button variant="outline" size="sm" onClick={copyYaml}>
                    {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                    {copied ? "Copied" : "Copy YAML"}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto max-h-96 overflow-y-auto">
                  <code>{review.improvedYaml}</code>
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
