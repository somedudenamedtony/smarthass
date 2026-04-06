import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <main className="flex max-w-2xl flex-col items-center gap-8 text-center">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            SmartHass
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            AI-powered companion for Home Assistant. Get insights, spot
            anomalies, and discover automation opportunities.
          </p>
        </div>

        <div className="flex gap-4">
          <Link href="/login">
            <Button size="lg">Sign In</Button>
          </Link>
          <Link href="/setup">
            <Button variant="outline" size="lg">
              First-Time Setup
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 pt-8 sm:grid-cols-3 text-left">
          <FeatureCard
            title="Smart Insights"
            description="AI analyzes your device usage patterns and suggests improvements."
          />
          <FeatureCard
            title="Anomaly Detection"
            description="Get alerted when something unusual happens in your smart home."
          />
          <FeatureCard
            title="Automation Ideas"
            description="Discover automation opportunities with ready-to-use YAML configs."
          />
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border p-4 space-y-2">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
