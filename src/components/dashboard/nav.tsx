"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/entities", label: "Entities" },
  { href: "/automations", label: "Automations" },
  { href: "/insights", label: "Insights" },
  { href: "/settings", label: "Settings" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      {/* Mobile header */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b bg-background px-4 py-3 md:hidden">
        <Link href="/dashboard" className="text-lg font-bold">
          SmartHass
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(!open)}
          aria-label="Toggle navigation"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {open ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </Button>
      </div>

      {/* Mobile nav overlay */}
      {open && (
        <div className="fixed inset-0 z-30 md:hidden">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setOpen(false)}
          />
          <nav className="absolute top-[57px] left-0 right-0 border-b bg-background p-4 shadow-lg">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    pathname.startsWith(item.href)
                      ? "bg-accent text-accent-foreground"
                      : "hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
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
    <aside className="hidden md:flex w-64 border-r bg-muted/40 p-6 flex-col gap-6">
      <Link href="/dashboard" className="text-lg font-bold">
        SmartHass
      </Link>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              pathname.startsWith(item.href)
                ? "bg-accent text-accent-foreground"
                : "hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto text-sm text-muted-foreground truncate">
        {email}
      </div>
    </aside>
  );
}
