"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  label: string;
  options: string[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
  className?: string;
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(next);
  }

  function remove(value: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selected);
    next.delete(value);
    onChange(next);
  }

  const hasSelection = selected.size > 0;

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open) setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-all min-w-[120px] text-left",
          open
            ? "border-primary/50 ring-2 ring-primary/20 bg-card"
            : "border-border/50 bg-card hover:border-border",
          hasSelection ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
          {hasSelection ? (
            [...selected].map((v) => (
              <span
                key={v}
                className="inline-flex items-center gap-0.5 rounded-md bg-primary/15 text-primary px-1.5 py-0.5 text-xs font-medium"
              >
                {v}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-primary/70"
                  onClick={(e) => remove(v, e)}
                />
              </span>
            ))
          ) : (
            <span>{label}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-full min-w-[180px] rounded-lg border border-border/50 bg-popover shadow-lg shadow-black/20 animate-in fade-in-0 zoom-in-95 duration-100">
          {options.length > 5 && (
            <div className="p-1.5 border-b border-border/30">
              <input
                ref={inputRef}
                type="text"
                placeholder="Filter..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md bg-muted/50 px-2.5 py-1.5 text-xs outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          )}
          <div className="max-h-[200px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-3 text-xs text-muted-foreground text-center">
                No matches
              </div>
            ) : (
              filtered.map((option) => {
                const isSelected = selected.has(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggle(option)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors text-left",
                      isSelected
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-accent"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <span className="truncate">{option}</span>
                  </button>
                );
              })
            )}
          </div>
          {hasSelection && (
            <div className="border-t border-border/30 p-1">
              <button
                type="button"
                onClick={() => {
                  onChange(new Set());
                  setOpen(false);
                }}
                className="w-full rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors text-center"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
