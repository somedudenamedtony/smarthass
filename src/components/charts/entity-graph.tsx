"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation";
  label?: string;
}

interface EntityGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (entityId: string) => void;
}

interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: "automation" | "correlation";
  label?: string;
}

const DOMAIN_COLORS: Record<string, string> = {
  light: "#f59e0b",
  switch: "#3b82f6",
  sensor: "#10b981",
  binary_sensor: "#8b5cf6",
  climate: "#ef4444",
  cover: "#6366f1",
  media_player: "#ec4899",
  fan: "#06b6d4",
  automation: "#f97316",
};

function getColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? "#6b7280";
}

export function EntityGraph({ nodes, edges, onNodeClick }: EntityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, SimLink> | null>(null);

  const render = useCallback(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const simNodes: SimNode[] = nodes.map((n) => ({ ...n }));
    const nodeIndex = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks: SimLink[] = edges
      .filter((e) => nodeIndex.has(e.source) && nodeIndex.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        type: e.type,
        label: e.label,
      }));

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(30));

    simulationRef.current = simulation;

    // Zoom
    const g = svg.append("g");
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.2, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        }) as unknown as (selection: d3.Selection<SVGSVGElement, unknown, null, undefined>) => void
    );

    // Edges
    const link = g
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks)
      .enter()
      .append("line")
      .attr("stroke", (d) =>
        d.type === "automation" ? "#f97316" : "#8b5cf6"
      )
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d) =>
        d.type === "correlation" ? "4,4" : null
      );

    // Node groups
    const node = g
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        if (onNodeClick) onNodeClick(d.entityId);
      })
      .call(
        d3
          .drag<SVGGElement, SimNode>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Circles
    node
      .append("circle")
      .attr("r", 12)
      .attr("fill", (d) => getColor(d.domain))
      .attr("stroke", "var(--card)")
      .attr("stroke-width", 2);

    // Labels
    node
      .append("text")
      .text((d) => d.friendlyName || d.entityId)
      .attr("dx", 16)
      .attr("dy", 4)
      .attr("class", "fill-foreground text-xs")
      .style("pointer-events", "none")
      .each(function () {
        // Truncate long names
        const el = d3.select(this);
        const text = el.text();
        if (text.length > 25) {
          el.text(text.slice(0, 22) + "…");
        }
      });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, onNodeClick]);

  useEffect(() => {
    return render();
  }, [render]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <p className="text-sm">
          No entity relationships found. Run an analysis and create some
          automations to see the graph.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] border rounded-xl overflow-hidden bg-card">
      <svg ref={svgRef} className="w-full h-full" />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm border rounded-lg px-3 py-2 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-orange-500" />
          <span>Automation link</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 border-t-2 border-dashed border-violet-500" />
          <span>Correlation</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-1 pt-1 border-t">
          {Object.entries(DOMAIN_COLORS)
            .slice(0, 6)
            .map(([domain, color]) => (
              <div key={domain} className="flex items-center gap-1">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span>{domain}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
