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
 * Render categorical/binary states as colored horizontal bands
 * with transition markers and hover tooltip.
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

  const MIN_BAND_WIDTH = 3;

  // Build segments with resolved positions
  const segments: { state: string; x0: number; x1: number; start: Date; end: Date }[] = [];
  for (let i = 0; i < data.length; i++) {
    const current = data[i];
    const next = data[i + 1];
    const startDate = new Date(current.last_changed);
    const endDate = next ? new Date(next.last_changed) : new Date();
    const rawX0 = x(startDate);
    const rawX1 = next ? x(endDate) : width;
    segments.push({
      state: current.state,
      x0: rawX0,
      x1: Math.max(rawX1, rawX0 + MIN_BAND_WIDTH),
      start: startDate,
      end: endDate,
    });
  }

  // Draw state bands
  for (const seg of segments) {
    g.append("rect")
      .attr("x", seg.x0)
      .attr("y", 0)
      .attr("width", seg.x1 - seg.x0)
      .attr("height", height)
      .attr("fill", colorScale(seg.state))
      .attr("opacity", 0.7);
  }

  // Draw transition markers at each state change
  for (let i = 1; i < data.length; i++) {
    if (data[i].state !== data[i - 1].state) {
      const xPos = x(new Date(data[i].last_changed));
      g.append("line")
        .attr("x1", xPos)
        .attr("x2", xPos)
        .attr("y1", 0)
        .attr("y2", height)
        .attr("stroke", "var(--foreground)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,2")
        .attr("opacity", 0.4);
    }
  }

  // Tooltip
  const tooltip = g
    .append("g")
    .attr("class", "chart-tooltip")
    .style("display", "none");

  const tooltipBg = tooltip
    .append("rect")
    .attr("rx", 4)
    .attr("ry", 4)
    .attr("fill", "var(--popover)")
    .attr("stroke", "var(--border)")
    .attr("stroke-width", 1);

  const tooltipState = tooltip
    .append("text")
    .attr("class", "fill-popover-foreground")
    .attr("font-size", "12px")
    .attr("font-weight", "600");

  const tooltipTime = tooltip
    .append("text")
    .attr("class", "fill-muted-foreground")
    .attr("font-size", "11px");

  const tooltipDur = tooltip
    .append("text")
    .attr("class", "fill-muted-foreground")
    .attr("font-size", "11px");

  // Hover line
  const hoverLine = g
    .append("line")
    .attr("y1", 0)
    .attr("y2", height)
    .attr("stroke", "var(--foreground)")
    .attr("stroke-width", 1)
    .attr("opacity", 0)
    .style("pointer-events", "none");

  // Invisible overlay for mouse events
  g.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "transparent")
    .style("cursor", "crosshair")
    .on("mousemove", function (event) {
      const [mx] = d3.pointer(event);
      const hoveredTime = x.invert(mx);

      // Find which segment the cursor is in
      let seg = segments[segments.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (hoveredTime < segments[i].end || i === segments.length - 1) {
          seg = segments[i];
          break;
        }
      }

      hoverLine.attr("x1", mx).attr("x2", mx).attr("opacity", 0.3);

      const durMs = seg.end.getTime() - seg.start.getTime();
      const durStr = formatMs(durMs);
      const timeStr = seg.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      tooltipState.text(seg.state).attr("x", 8).attr("y", 16);
      tooltipTime.text(timeStr).attr("x", 8).attr("y", 30);
      tooltipDur.text(`Duration: ${durStr}`).attr("x", 8).attr("y", 44);

      const boxW = 160;
      const boxH = 52;
      tooltipBg.attr("width", boxW).attr("height", boxH);

      // Position tooltip, flip if near edge
      const tx = mx + 12 + boxW > width ? mx - boxW - 12 : mx + 12;
      const ty = Math.min(Math.max(0, height / 2 - boxH / 2), height - boxH);
      tooltip.attr("transform", `translate(${tx},${ty})`).style("display", null);
    })
    .on("mouseleave", function () {
      tooltip.style("display", "none");
      hoverLine.attr("opacity", 0);
    });

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

function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}
