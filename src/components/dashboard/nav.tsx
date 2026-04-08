"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Brain,
  Zap,
  Activity,
  Coins,
  Settings,
  Menu,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: Sparkles },
  { href: "/insights", label: "All Insights", icon: Brain },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/entities", label: "Entities", icon: Activity },
  { href: "/ai-usage", label: "AI Usage", icon: Coins },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile header */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b glass-strong px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/20 flex items-center justify-center">
            <Activity className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-bold text-gradient">SmartHass</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile nav overlay */}
      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute top-[57px] left-0 right-0 glass-strong p-4 shadow-lg animate-slide-in">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/dashboard"
                  ? pathname === "/dashboard" || pathname.startsWith("/dashboard/")
                  : item.href === "/entities"
                    ? pathname === "/entities" || pathname.startsWith("/entities/")
                    : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                      active
                        ? "bg-primary/15 text-primary glow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}

export function DesktopSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-48 border-r border-border/50 bg-sidebar p-3 flex-col gap-3 relative overflow-hidden">
      {/* Subtle gradient glow at top */}
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      <Link href="/dashboard" className="flex items-center gap-2 relative z-10">
        <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center glow-sm">
          <Activity className="h-4 w-4 text-primary" />
        </div>
        <span className="text-lg font-bold text-gradient">SmartHass</span>
      </Link>

      <nav className="flex flex-col gap-1 relative z-10">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/dashboard"
            ? pathname === "/dashboard" || pathname.startsWith("/dashboard/")
            : item.href === "/entities"
              ? pathname === "/entities" || pathname.startsWith("/entities/")
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-primary/15 text-primary glow-sm"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
              {item.label}
              {active && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary animate-glow-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto relative z-10">
        <div className="rounded-md bg-accent/30 px-2 py-1.5">
          <p className="text-[11px] text-muted-foreground truncate">{email}</p>
        </div>
      </div>
    </aside>
  );
}
