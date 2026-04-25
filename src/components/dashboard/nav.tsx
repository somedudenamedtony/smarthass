"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import {
  Home,
  Lightbulb,
  Zap,
  Activity,
  BarChart3,
  Settings,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  Gauge,
  Layers,
  FileCode,
} from "lucide-react";

// Navigation items with HA-style icons
const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/automations", label: "Automations", icon: Zap },
  { href: "/entities", label: "Entities", icon: Activity },
  { href: "/energy", label: "Energy", icon: Gauge },
  { href: "/scenes", label: "Scenes", icon: Layers },
  { href: "/blueprints", label: "Blueprints", icon: FileCode },
  { href: "/ai-usage", label: "AI Usage", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("system");
    else setTheme("dark");
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-accent transition-colors"
      title={`Theme: ${theme}`}
    >
      {theme === "dark" && <Moon className="h-4 w-4" />}
      {theme === "light" && <Sun className="h-4 w-4" />}
      {theme === "system" && <Monitor className="h-4 w-4" />}
    </button>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close menu on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Mobile header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-lg font-semibold">SmartHass</span>
        </Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile nav overlay */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute top-[65px] left-0 right-0 bg-background border-b shadow-lg animate-slide-in max-h-[calc(100vh-65px)] overflow-y-auto">
            <div className="p-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className={`h-5 w-5 ${active ? "text-primary" : ""}`} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Mobile bottom navigation - HA Companion app style */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t md:hidden safe-area-bottom">
        <div className="flex items-center justify-around py-2">
          {NAV_ITEMS.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg transition-colors ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function DesktopSidebar({ email }: { email: string | null }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("smarthass-sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    localStorage.setItem("smarthass-sidebar-collapsed", String(newState));
  };

  const isExpanded = !collapsed || hovered;

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`hidden md:flex flex-col border-r bg-sidebar transition-all duration-200 ${
        isExpanded ? "w-56" : "w-16"
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-sidebar-border">
        <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
          <div className="h-9 w-9 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          {isExpanded && (
            <span className="text-lg font-semibold truncate animate-fade-up">
              SmartHass
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={!isExpanded ? item.label : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                active
                  ? "bg-primary/15 text-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 flex-shrink-0 ${active ? "text-primary" : ""}`} />
              {isExpanded && (
                <span className="truncate">{item.label}</span>
              )}
              {active && isExpanded && (
                <div className="ml-auto h-2 w-2 rounded-full bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-2">
        {/* Theme toggle */}
        <div className={`flex items-center ${isExpanded ? "justify-between px-2" : "justify-center"}`}>
          {isExpanded && <span className="text-xs text-muted-foreground">Theme</span>}
          <ThemeToggle />
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapsed}
          className={`flex items-center gap-2 w-full rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors ${
            !isExpanded ? "justify-center" : ""
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
          {isExpanded && <span>{collapsed ? "Expand" : "Collapse"}</span>}
        </button>

        {/* User email */}
        {email && isExpanded && (
          <div className="rounded-lg bg-sidebar-accent/50 px-3 py-2">
            <p className="text-xs text-muted-foreground truncate">{email}</p>
          </div>
        )}
      </div>
    </aside>
  );
}

// Helper to check if a nav item is active
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  }
  if (href === "/entities") {
    return pathname === "/entities" || pathname.startsWith("/entities/");
  }
  if (href === "/automations") {
    return pathname === "/automations" || pathname.startsWith("/automations/");
  }
  return pathname.startsWith(href);
}
