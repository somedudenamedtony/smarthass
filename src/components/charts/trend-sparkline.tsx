"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface SparklinePoint {
  date: string;
  value: number;
}

interface TrendSparklineProps {
  data: SparklinePoint[];
  color?: string;
  height?: number;
  showArea?: boolean;
}

export function TrendSparkline({
  data,
  color = "oklch(0.75 0.18 195)",
  height = 32,
  showArea = true,
}: TrendSparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length < 2) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 120;

    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => new Date(d.date)) as [Date, Date])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(data, (d) => d.value) || 1])
      .range([height - 2, 2]);

    const line = d3
      .line<SparklinePoint>()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    const g = svg
      .attr("width", width)
      .attr("height", height);

    if (showArea) {
      const area = d3
        .area<SparklinePoint>()
        .x((d) => x(new Date(d.date)))
        .y0(height)
        .y1((d) => y(d.value))
        .curve(d3.curveMonotoneX);

      // Gradient
      const gradientId = `sparkline-gradient-${Math.random().toString(36).slice(2)}`;
      const defs = g.append("defs");
      const gradient = defs
        .append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "0%")
        .attr("y2", "100%");
      gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.3);
      gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0);

      g.append("path")
        .datum(data)
        .attr("fill", `url(#${gradientId})`)
        .attr("d", area);
    }

    g.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("d", line);

    // End dot
    const last = data[data.length - 1];
    g.append("circle")
      .attr("cx", x(new Date(last.date)))
      .attr("cy", y(last.value))
      .attr("r", 2)
      .attr("fill", color);
  }, [data, color, height, showArea]);

  if (data.length < 2) return null;

  return <svg ref={svgRef} className="w-full" style={{ height }} />;
}
