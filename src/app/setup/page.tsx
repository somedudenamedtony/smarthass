"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch("/api/setup");
        const data = await res.json();
        if (!data.needsSetup) {
          router.replace("/login");
          return;
        }
        // HA add-on mode: auto-setup without user interaction
        if (data.isHomeAssistant) {
          setSubmitting(true);
          const setupRes = await fetch("/api/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (setupRes.ok) {
            router.replace("/dashboard");
          } else {
            const err = await setupRes.json();
            setError(err.error || "Auto-setup failed.");
            setSubmitting(false);
          }
          return;
        }
      } finally {
        setChecking(false);
      }
    }
    check();
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, anthropicKey: anthropicKey || undefined }),
      });

      if (res.ok) {
        router.push("/login");
      } else {
        const data = await res.json();
        setError(data.error || "Setup failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Checking setup status…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to SmartHass</CardTitle>
          <CardDescription>
            Create your admin account to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Admin"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="admin@local"
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="At least 8 characters"
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="Repeat password"
                required
                minLength={8}
              />
            </div>

            <div className="rounded-md border p-4 space-y-3 bg-muted/30">
              <div>
                <label htmlFor="anthropicKey" className="text-sm font-medium">
                  Anthropic API Key
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional — needed for AI analysis features. You can add this later in Settings.
                </p>
              </div>
              <input
                id="anthropicKey"
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                placeholder="sk-ant-..."
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting}
            >
              {submitting ? "Creating account…" : "Create Account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
