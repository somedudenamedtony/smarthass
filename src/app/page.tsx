import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Brain,
  AlertTriangle,
  Zap,
  GitBranch,
  Cpu,
  Sparkles,
} from "lucide-react";
import { isHomeAssistant } from "@/lib/config";

export default function Home() {
  // In HA add-on mode, skip the landing page entirely
  if (isHomeAssistant()) {
    redirect("/dashboard");
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-8">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-chart-3/5 blur-3xl" />
        <div className="absolute top-3/4 left-1/4 h-[300px] w-[300px] rounded-full bg-chart-5/5 blur-3xl" />
      </div>

      <main className="relative z-10 flex max-w-3xl flex-col items-center gap-10 text-center">
        <div className="space-y-6 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-sm text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Home Intelligence
          </div>
          <h1 className="text-5xl font-bold tracking-tight sm:text-6xl text-gradient">
            SmartHass
          </h1>
          <p className="text-lg text-muted-foreground max-w-lg mx-auto leading-relaxed">
            Your AI companion for Home Assistant. Uncover usage patterns, spot
            anomalies, correlate devices, and generate automations — all powered
            by advanced AI analysis.
          </p>
        </div>

        <div className="flex gap-4 animate-fade-up" style={{ animationDelay: "0.1s" }}>
          <Link href="/login">
            <Button size="lg" className="glow-sm px-8">
              Sign In
            </Button>
          </Link>
          <Link href="/setup">
            <Button variant="outline" size="lg" className="border-border/50 px-8">
              First-Time Setup
            </Button>
          </Link>
        </div>

        <div
          className="grid gap-4 pt-4 sm:grid-cols-3 text-left w-full animate-fade-up"
          style={{ animationDelay: "0.2s" }}
        >
          <FeatureCard
            icon={<Brain className="h-5 w-5" />}
            title="Smart Insights"
            description="AI analyzes usage patterns and trending behavior across all your devices."
            color="text-primary"
          />
          <FeatureCard
            icon={<AlertTriangle className="h-5 w-5" />}
            title="Anomaly Detection"
            description="Get alerted when something unusual happens in your smart home."
            color="text-chart-5"
          />
          <FeatureCard
            icon={<Zap className="h-5 w-5" />}
            title="Automation Ideas"
            description="Discover automation opportunities with ready-to-deploy YAML configs."
            color="text-chart-2"
          />
          <FeatureCard
            icon={<GitBranch className="h-5 w-5" />}
            title="Cross-Device Correlation"
            description="Find hidden relationships between devices and rooms."
            color="text-chart-3"
          />
          <FeatureCard
            icon={<Cpu className="h-5 w-5" />}
            title="Device Suggestions"
            description="Get recommendations for new devices that complement your setup."
            color="text-chart-4"
          />
          <FeatureCard
            icon={<Sparkles className="h-5 w-5" />}
            title="Trending Analysis"
            description="Track how your energy use, temperature, and habits change over time."
            color="text-primary"
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}) {
  return (
    <div className="group rounded-xl border border-border/30 bg-card/50 p-5 space-y-3 hover:border-primary/30 hover:bg-card/80 transition-all">
      <div className={`${color}`}>{icon}</div>
      <h3 className="font-semibold group-hover:text-primary transition-colors">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
