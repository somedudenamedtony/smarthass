"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface HistoryPoint {
  state: string;
  last_changed: string;
}

interface EntityHistoryChartProps {
  data: HistoryPoint[];
  domain: string;
}

export function EntityHistoryChart({ data, domain }: EntityHistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 8, right: 16, bottom: 40, left: 60 };
    const width = svgRef.current.clientWidth - margin.left - margin.right;
    const height = 240 - margin.top - margin.bottom;

    const g = svg
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const dates = data.map((d) => new Date(d.last_changed));

    const x = d3
      .scaleTime()
      .domain(d3.extent(dates) as [Date, Date])
      .range([0, width]);

    // For sensor domains, render as a line chart with numeric values
    if (domain === "sensor") {
      const numericData = data
        .map((d) => ({
          date: new Date(d.last_changed),
          value: parseFloat(d.state),
        }))
        .filter((d) => !isNaN(d.value));

      if (numericData.length === 0) {
        renderCategorical(g, data, x, width, height);
      } else {
        const y = d3
          .scaleLinear()
          .domain(d3.extent(numericData, (d) => d.value) as [number, number])
          .nice()
          .range([height, 0]);

        const line = d3
          .line<{ date: Date; value: number }>()
          .x((d) => x(d.date))
          .y((d) => y(d.value))
          .curve(d3.curveStepAfter);

        g.append("path")
          .datum(numericData)
          .attr("fill", "none")
          .attr("stroke", "var(--primary)")
          .attr("stroke-width", 1.5)
          .attr("d", line);

        // Y axis
        g.append("g")
          .call(d3.axisLeft(y).ticks(5))
          .call((g) => g.select(".domain").remove())
          .selectAll("text")
          .attr("class", "fill-muted-foreground text-xs");

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
          .call((g) => g.select(".domain").remove());
      }
    } else {
      renderCategorical(g, data, x, width, height);
    }

    // X axis
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(6).tickSizeOuter(0))
      .selectAll("text")
      .attr("class", "fill-muted-foreground text-xs")
      .attr("transform", "rotate(-30)")
      .attr("text-anchor", "end");
  }, [data, domain]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No history data available.
      </p>
    );
  }

  return <svg ref={svgRef} className="w-full" />;
}

/**
 * Render categorical/binary states as colored horizontal bands.
 */
function renderCategorical(
  g: d3.Selection<SVGGElement, unknown, null, undefined>,
  data: HistoryPoint[],
  x: d3.ScaleTime<number, number>,
  width: number,
  height: number
) {
  const states = [...new Set(data.map((d) => d.state))];
  const colorScale = d3
    .scaleOrdinal<string>()
    .domain(states)
    .range(d3.schemeTableau10);

  // Draw state bands
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const next = data[i + 1];
    const x0 = x(new Date(current.last_changed));
    const x1 = next ? x(new Date(next.last_changed)) : width;

    g.append("rect")
      .attr("x", x0)
      .attr("y", 0)
      .attr("width", Math.max(x1 - x0, 1))
      .attr("height", height)
      .attr("fill", colorScale(current.state))
      .attr("opacity", 0.7);
  }

  // Legend
  const legend = g
    .append("g")
    .attr("transform", `translate(${width - states.length * 80}, -4)`);

  states.forEach((state, i) => {
    const item = legend.append("g").attr("transform", `translate(${i * 80}, 0)`);
    item
      .append("rect")
      .attr("width", 10)
      .attr("height", 10)
      .attr("rx", 2)
      .attr("fill", colorScale(state));
    item
      .append("text")
      .attr("x", 14)
      .attr("y", 9)
      .attr("class", "fill-muted-foreground text-xs")
      .text(state);
  });
}
