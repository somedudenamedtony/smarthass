"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DomainEntry {
  domain: string;
  count: number;
}

const DOMAIN_COLORS: Record<string, string> = {
  light: "#facc15",
  switch: "#60a5fa",
  sensor: "#34d399",
  binary_sensor: "#a78bfa",
  automation: "#f87171",
  climate: "#fb923c",
  cover: "#2dd4bf",
  media_player: "#e879f9",
  person: "#38bdf8",
  device_tracker: "#818cf8",
};

function getDomainColor(domain: string, i: number): string {
  return (
    DOMAIN_COLORS[domain] ??
    d3.schemeTableau10[i % d3.schemeTableau10.length]
  );
}

export function DomainDistributionChart({ data }: { data: DomainEntry[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const size = 200;
    const radius = size / 2;

    const g = svg
      .attr("width", size)
      .attr("height", size)
      .append("g")
      .attr("transform", `translate(${radius},${radius})`);

    const pie = d3
      .pie<DomainEntry>()
      .value((d) => d.count)
      .sort(null);

    const arc = d3
      .arc<d3.PieArcDatum<DomainEntry>>()
      .innerRadius(radius * 0.55)
      .outerRadius(radius - 4);

    g.selectAll("path")
      .data(pie(data))
      .join("path")
      .attr("d", arc)
      .attr("fill", (d, i) => getDomainColor(d.data.domain, i))
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 2);
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No entities synced yet.
      </p>
    );
  }

  return (
    <div className="flex items-center gap-6">
      <svg ref={svgRef} />
      <div className="flex flex-col gap-1">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.domain} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: getDomainColor(d.domain, i) }}
            />
            <span className="text-muted-foreground">{d.domain}</span>
            <span className="font-medium">{d.count}</span>
          </div>
        ))}
        {data.length > 8 && (
          <span className="text-xs text-muted-foreground">
            +{data.length - 8} more
          </span>
        )}
      </div>
    </div>
  );
}
