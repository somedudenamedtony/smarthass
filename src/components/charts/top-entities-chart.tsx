"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface TopEntity {
  id?: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  totalChanges: number;
}

export function TopEntitiesChart({
  data,
  pageSize = 5,
}: {
  data: TopEntity[];
  pageSize?: number;
}) {
  const [page, setPage] = useState(0);
  const router = useRouter();
  const totalPages = Math.max(Math.ceil(data.length / pageSize), 1);
  const pageData = data.slice(page * pageSize, (page + 1) * pageSize);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No activity data yet. Mark entities as tracked and sync to start
        collecting stats.
      </p>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.totalChanges), 1);

  return (
    <div className="space-y-2">
      {pageData.map((d) => {
        const pct = (d.totalChanges / maxValue) * 100;
        const label = d.friendlyName || d.entityId;
        const row = (
          <div key={d.entityId} className={`flex items-center gap-3${d.id ? " rounded-lg hover:bg-accent/40 transition-colors px-1 -mx-1" : ""}`}>
            <span
              className="text-xs text-muted-foreground truncate shrink-0 text-right"
              style={{ width: "12rem" }}
              title={label}
            >
              {label}
            </span>
            <div className="flex-1 flex items-center gap-2">
              <div className="flex-1 relative h-7 rounded bg-muted overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded bg-primary/80 transition-all"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
                {pct > 30 && (
                  <span
                    className="absolute inset-y-0 flex items-center text-xs font-medium tabular-nums text-primary-foreground"
                    style={{ right: `${100 - pct + 1}%` }}
                  >
                    {d.totalChanges.toLocaleString()}
                  </span>
                )}
              </div>
              {pct <= 30 && (
                <span className="text-xs font-medium tabular-nums text-foreground shrink-0">
                  {d.totalChanges.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        );
        return d.id ? (
          <div key={d.entityId} role="link" tabIndex={0} className="cursor-pointer" onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/entities/${d.id}`); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); router.push(`/entities/${d.id}`); } }}>
            {row}
          </div>
        ) : row;
      })}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            {page * pageSize + 1}&ndash;{Math.min((page + 1) * pageSize, data.length)} of {data.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage((p) => Math.max(0, p - 1)); }}
              disabled={page === 0}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPage((p) => Math.min(totalPages - 1, p + 1)); }}
              disabled={page >= totalPages - 1}
              className="p-1 rounded hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
