"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface HeatmapData {
  day: number; // 0-6 (Sun-Sat)
  hour: number; // 0-23
  value: number;
}

export function ActivityHeatmap({ data }: { data: HeatmapData[] }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 24, right: 8, bottom: 8, left: 36 };
    const cellSize = 20;
    const width = 24 * cellSize + margin.left + margin.right;
    const height = 7 * cellSize + margin.top + margin.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const maxVal = d3.max(data, (d) => d.value) || 1;

    const colorScale = d3
      .scaleSequential()
      .domain([0, maxVal])
      .interpolator((t: number) => {
        // Dark to cyan glow
        const r = Math.round(10 + t * 20);
        const g = Math.round(20 + t * 200);
        const b = Math.round(30 + t * 210);
        return `rgb(${r},${g},${b})`;
      });

    const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Day labels
    dayLabels.forEach((label, i) => {
      g.append("text")
        .attr("x", -4)
        .attr("y", i * cellSize + cellSize / 2)
        .attr("dy", "0.35em")
        .attr("text-anchor", "end")
        .attr("class", "fill-muted-foreground")
        .style("font-size", "9px")
        .text(label);
    });

    // Hour labels
    [0, 6, 12, 18].forEach((h) => {
      g.append("text")
        .attr("x", h * cellSize + cellSize / 2)
        .attr("y", -6)
        .attr("text-anchor", "middle")
        .attr("class", "fill-muted-foreground")
        .style("font-size", "9px")
        .text(`${h}:00`);
    });

    // Cells
    g.selectAll("rect")
      .data(data)
      .join("rect")
      .attr("x", (d) => d.hour * cellSize + 1)
      .attr("y", (d) => d.day * cellSize + 1)
      .attr("width", cellSize - 2)
      .attr("height", cellSize - 2)
      .attr("rx", 3)
      .attr("fill", (d) => (d.value > 0 ? colorScale(d.value) : "oklch(0.18 0.01 260)"))
      .attr("opacity", (d) => (d.value > 0 ? 0.6 + (d.value / maxVal) * 0.4 : 0.3))
      .append("title")
      .text((d) => `${dayLabels[d.day]} ${d.hour}:00 — ${d.value} changes`);
  }, [data]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Not enough data for activity heatmap.
      </p>
    );
  }

  return <svg ref={svgRef} className="w-full max-w-[540px]" />;
}
