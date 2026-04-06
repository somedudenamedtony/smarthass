"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface TopEntity {
  entityId: string;
  friendlyName: string | null;
  domain: string;
  totalChanges: number;
}

export function TopEntitiesChart({ data }: { data: TopEntity[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const maxLabelLen = 28;
    const truncate = (s: string) =>
      s.length > maxLabelLen ? s.slice(0, maxLabelLen - 1) + "…" : s;

    const margin = { top: 8, right: 16, bottom: 32, left: 200 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = data.length * 40;

    const g = svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.totalChanges) ?? 1])
      .range([0, width]);

    const labels = data.map((d) => truncate(d.friendlyName || d.entityId));

    const y = d3
      .scaleBand()
      .domain(labels)
      .range([0, height])
      .padding(0.25);

    // Bars
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", 0)
      .attr("y", (_d, i) => y(labels[i])!)
      .attr("width", (d) => x(d.totalChanges))
      .attr("height", y.bandwidth())
      .attr("rx", 4)
      .attr("class", "fill-primary/80");

    // Labels on bars
    g.selectAll(".bar-label")
      .data(data)
      .join("text")
      .attr("class", "fill-primary-foreground text-xs")
      .attr("x", (d) => Math.max(x(d.totalChanges) - 8, 4))
      .attr("y", (_d, i) => y(labels[i])! + y.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("text-anchor", (d) => (x(d.totalChanges) > 40 ? "end" : "start"))
      .text((d) => d.totalChanges);

    // Y axis
    g.append("g")
      .call(d3.axisLeft(y).tickSize(0).tickPadding(8))
      .call((g) => g.select(".domain").remove())
      .selectAll("text")
      .attr("class", "fill-muted-foreground text-xs");
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No activity data yet. Mark entities as tracked and sync to start
        collecting stats.
      </p>
    );
  }

  return <svg ref={svgRef} className="w-full" />;
}
