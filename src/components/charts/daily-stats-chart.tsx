"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface DailyStat {
  date: string;
  stateChanges: number;
  activeTime: number;
}

interface DailyStatsChartProps {
  data: DailyStat[];
  metric: "stateChanges" | "activeTime";
  previousData?: DailyStat[];
}

export function DailyStatsChart({
  data,
  metric,
  previousData,
}: DailyStatsChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 12, right: 16, bottom: 40, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = 220 - margin.top - margin.bottom;

    const g = svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const sorted = [...data].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    const values = sorted.map((d) =>
      metric === "activeTime" ? d.activeTime / 3600 : d.stateChanges
    );
    const dates = sorted.map((d) => new Date(d.date));

    const x = d3
      .scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, width]);

    let maxVal = d3.max(values) ?? 0;

    // If we have previous data, compute its values too for the y-domain
    let prevValues: number[] = [];
    if (previousData && previousData.length > 0) {
      const prevSorted = [...previousData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      prevValues = prevSorted.map((d) =>
        metric === "activeTime" ? d.activeTime / 3600 : d.stateChanges
      );
      const prevMax = d3.max(prevValues) ?? 0;
      maxVal = Math.max(maxVal, prevMax);
    }

    const y = d3
      .scaleLinear()
      .domain([0, maxVal * 1.1])
      .nice()
      .range([height, 0]);

    // Gridlines
    g.append("g")
      .attr("class", "opacity-10")
      .call(
        d3
          .axisLeft(y)
          .ticks(5)
          .tickSize(-width)
          .tickFormat(() => "")
      )
      .call((sel) => sel.select(".domain").remove());

    const line = d3
      .line<number>()
      .curve(d3.curveMonotoneX);

    // Previous period (ghosted overlay)
    if (previousData && previousData.length > 0) {
      const prevSorted = [...previousData].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      // Shift previous dates forward by the period length so they align
      const periodMs = dates.length > 1
        ? dates[dates.length - 1].getTime() - dates[0].getTime()
        : 0;
      const prevDates = prevSorted.map((d) => {
        const t = new Date(d.date);
        t.setTime(t.getTime() + periodMs + 86400000);
        return t;
      });

      const prevLine = d3
        .line<{ x: Date; y: number }>()
        .x((d) => x(d.x))
        .y((d) => y(d.y))
        .curve(d3.curveMonotoneX);

      const prevPoints = prevSorted.map((d, i) => ({
        x: prevDates[i],
        y: metric === "activeTime" ? d.activeTime / 3600 : d.stateChanges,
      }));

      g.append("path")
        .datum(prevPoints)
        .attr("fill", "none")
        .attr("stroke", "var(--muted-foreground)")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4,4")
        .attr("opacity", 0.5)
        .attr("d", prevLine);
    }

    // Current period line
    const currentLine = d3
      .line<{ x: Date; y: number }>()
      .x((d) => x(d.x))
      .y((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    const currentPoints = sorted.map((d, i) => ({
      x: dates[i],
      y: values[i],
    }));

    // Area fill
    const area = d3
      .area<{ x: Date; y: number }>()
      .x((d) => x(d.x))
      .y0(height)
      .y1((d) => y(d.y))
      .curve(d3.curveMonotoneX);

    g.append("path")
      .datum(currentPoints)
      .attr("fill", "var(--primary)")
      .attr("fill-opacity", 0.1)
      .attr("d", area);

    g.append("path")
      .datum(currentPoints)
      .attr("fill", "none")
      .attr("stroke", "var(--primary)")
      .attr("stroke-width", 2)
      .attr("d", currentLine);

    // Dots
    g.selectAll(".dot")
      .data(currentPoints)
      .enter()
      .append("circle")
      .attr("cx", (d) => x(d.x))
      .attr("cy", (d) => y(d.y))
      .attr("r", 3)
      .attr("fill", "var(--primary)");

    // Axes
    g.append("g")
      .call(d3.axisLeft(y).ticks(5))
      .call((sel) => sel.select(".domain").remove())
      .selectAll("text")
      .attr("class", "fill-muted-foreground text-xs");

    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0))
      .selectAll("text")
      .attr("class", "fill-muted-foreground text-xs")
      .attr("transform", "rotate(-30)")
      .attr("text-anchor", "end");

    // Y-axis label
    g.append("text")
      .attr("transform", "rotate(-90)")
      .attr("y", -50)
      .attr("x", -height / 2)
      .attr("text-anchor", "middle")
      .attr("class", "fill-muted-foreground text-xs")
      .text(metric === "activeTime" ? "Active Hours" : "State Changes");
  }, [data, metric, previousData]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No daily stats available.
      </p>
    );
  }

  return <svg ref={svgRef} className="w-full" />;
}
