"use client";

import { useEffect, useRef, useCallback } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  entityId: string;
  friendlyName: string | null;
  domain: string;
  areaId: string | null;
  deviceId: string | null;
  lastState: string | null;
  activity: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "automation" | "correlation" | "device" | "area";
  label?: string;
  weight?: number;
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
  deviceId: string | null;
  lastState: string | null;
  activity: number;
}

interface SimLink extends d3.SimulationLinkDatum<SimNode> {
  type: "automation" | "correlation" | "device" | "area";
  label?: string;
  weight?: number;
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
  person: "#14b8a6",
  input_boolean: "#a855f7",
  input_number: "#22d3ee",
  scene: "#84cc16",
  script: "#fb923c",
  camera: "#e11d48",
  lock: "#64748b",
};

const EDGE_STYLES: Record<
  string,
  { color: string; dash: string | null; opacity: number; width: number }
> = {
  automation: { color: "#f97316", dash: null, opacity: 0.7, width: 2 },
  correlation: { color: "#8b5cf6", dash: "6,3", opacity: 0.6, width: 1.5 },
  device: { color: "#06b6d4", dash: "2,2", opacity: 0.35, width: 1 },
  area: { color: "#6b7280", dash: "1,3", opacity: 0.2, width: 0.75 },
};

function getColor(domain: string): string {
  return DOMAIN_COLORS[domain] ?? "#6b7280";
}

function nodeRadius(activity: number): number {
  if (activity === 0) return 6;
  return Math.min(6 + Math.sqrt(activity) * 0.8, 24);
}

export function EntityGraph({ nodes, edges, onNodeClick }: EntityGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
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
        weight: e.weight,
      }));

    // Compute link count per node for layout
    const linkCount = new Map<string, number>();
    for (const l of simLinks) {
      const s = typeof l.source === "string" ? l.source : (l.source as SimNode).id;
      const t = typeof l.target === "string" ? l.target : (l.target as SimNode).id;
      linkCount.set(s, (linkCount.get(s) ?? 0) + 1);
      linkCount.set(t, (linkCount.get(t) ?? 0) + 1);
    }

    // Area clustering force
    const areaTargets = new Map<string, { x: number; y: number }>();
    const uniqueAreas = [...new Set(simNodes.map((n) => n.areaId).filter(Boolean))] as string[];
    uniqueAreas.forEach((area, i) => {
      const angle = (2 * Math.PI * i) / Math.max(uniqueAreas.length, 1);
      const r = Math.min(width, height) * 0.25;
      areaTargets.set(area, {
        x: width / 2 + r * Math.cos(angle),
        y: height / 2 + r * Math.sin(angle),
      });
    });

    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        "link",
        d3
          .forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((d) => {
            if (d.type === "device") return 40;
            if (d.type === "area") return 100;
            if (d.type === "automation") return 80;
            return 90;
          })
          .strength((d) => {
            if (d.type === "automation") return 0.7;
            if (d.type === "device") return 0.9;
            if (d.type === "correlation") return 0.5;
            return 0.15;
          })
      )
      .force("charge", d3.forceManyBody().strength((d) => {
        const n = d as SimNode;
        const links = linkCount.get(n.id) ?? 0;
        return links > 0 ? -200 - links * 30 : -60;
      }))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.05))
      .force("collision", d3.forceCollide<SimNode>().radius((d) => nodeRadius(d.activity) + 8))
      .force("area", () => {
        for (const n of simNodes) {
          if (n.areaId && areaTargets.has(n.areaId)) {
            const target = areaTargets.get(n.areaId)!;
            n.vx = (n.vx ?? 0) + (target.x - (n.x ?? 0)) * 0.008;
            n.vy = (n.vy ?? 0) + (target.y - (n.y ?? 0)) * 0.008;
          }
        }
      });

    simulationRef.current = simulation;

    // Arrowhead marker for automation edges
    const defs = svg.append("defs");
    defs
      .append("marker")
      .attr("id", "arrow-automation")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 20)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-4L8,0L0,4")
      .attr("fill", EDGE_STYLES.automation.color);

    // Zoom
    const g = svg.append("g");
    svg.call(
      d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 6])
        .on("zoom", (event) => {
          g.attr("transform", event.transform);
        }) as unknown as (
        selection: d3.Selection<SVGSVGElement, unknown, null, undefined>
      ) => void
    );

    // Area background hulls
    const areaHullGroup = g.append("g").attr("class", "area-hulls");

    // Edges
    const link = g
      .append("g")
      .selectAll<SVGLineElement, SimLink>("line")
      .data(simLinks)
      .enter()
      .append("line")
      .attr("stroke", (d) => EDGE_STYLES[d.type]?.color ?? "#6b7280")
      .attr("stroke-opacity", (d) => EDGE_STYLES[d.type]?.opacity ?? 0.4)
      .attr("stroke-width", (d) => EDGE_STYLES[d.type]?.width ?? 1)
      .attr("stroke-dasharray", (d) => EDGE_STYLES[d.type]?.dash ?? null)
      .attr("marker-end", (d) =>
        d.type === "automation" ? "url(#arrow-automation)" : null
      );

    // Edge hover labels
    const edgeLabel = g
      .append("g")
      .selectAll<SVGTextElement, SimLink>("text")
      .data(simLinks.filter((l) => l.label && (l.type === "automation" || l.type === "correlation")))
      .enter()
      .append("text")
      .attr("class", "fill-muted-foreground")
      .attr("font-size", 9)
      .attr("text-anchor", "middle")
      .attr("opacity", 0)
      .text((d) => {
        const t = d.label ?? "";
        return t.length > 30 ? t.slice(0, 27) + "…" : t;
      });

    // Node groups
    const node = g
      .append("g")
      .selectAll<SVGGElement, SimNode>("g.node")
      .data(simNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .on("click", (_event, d) => {
        if (onNodeClick) onNodeClick(d.entityId);
      })
      .on("mouseenter", function (_event, d) {
        // Highlight connected edges
        link
          .attr("stroke-opacity", (l) => {
            const s = (l.source as SimNode).id;
            const t = (l.target as SimNode).id;
            return s === d.id || t === d.id
              ? 1
              : (EDGE_STYLES[l.type]?.opacity ?? 0.4) * 0.2;
          })
          .attr("stroke-width", (l) => {
            const s = (l.source as SimNode).id;
            const t = (l.target as SimNode).id;
            return s === d.id || t === d.id
              ? (EDGE_STYLES[l.type]?.width ?? 1) * 2
              : EDGE_STYLES[l.type]?.width ?? 1;
          });

        // Show edge labels for connected edges
        edgeLabel.attr("opacity", (l) => {
          const s = (l.source as SimNode).id;
          const t = (l.target as SimNode).id;
          return s === d.id || t === d.id ? 0.8 : 0;
        });

        // Dim unconnected nodes
        node.select("circle").attr("opacity", (n) => {
          if (n.id === d.id) return 1;
          const connected = simLinks.some((l) => {
            const s = (l.source as SimNode).id;
            const t = (l.target as SimNode).id;
            return (s === d.id && t === n.id) || (t === d.id && s === n.id);
          });
          return connected ? 1 : 0.2;
        });
        node.select("text").attr("opacity", (n) => {
          if (n.id === d.id) return 1;
          const connected = simLinks.some((l) => {
            const s = (l.source as SimNode).id;
            const t = (l.target as SimNode).id;
            return (s === d.id && t === n.id) || (t === d.id && s === n.id);
          });
          return connected ? 1 : 0.15;
        });

        // Tooltip
        if (tooltipRef.current) {
          const tip = tooltipRef.current;
          const connections = simLinks.filter((l) => {
            const s = (l.source as SimNode).id;
            const t = (l.target as SimNode).id;
            return s === d.id || t === d.id;
          }).length;
          tip.innerHTML = `
            <div class="font-medium">${d.friendlyName || d.entityId}</div>
            <div class="text-muted-foreground">${d.domain}${d.areaId ? ` · ${d.areaId}` : ""}</div>
            <div class="text-muted-foreground">State: ${d.lastState ?? "unknown"}</div>
            <div class="text-muted-foreground">${d.activity} changes (14d) · ${connections} connections</div>
          `;
          tip.style.display = "block";
        }
      })
      .on("mousemove", function (event) {
        if (tooltipRef.current) {
          const [mx, my] = d3.pointer(event, svgRef.current);
          tooltipRef.current.style.left = `${mx + 16}px`;
          tooltipRef.current.style.top = `${my - 10}px`;
        }
      })
      .on("mouseleave", function () {
        // Reset
        link
          .attr("stroke-opacity", (d) => EDGE_STYLES[d.type]?.opacity ?? 0.4)
          .attr("stroke-width", (d) => EDGE_STYLES[d.type]?.width ?? 1);
        edgeLabel.attr("opacity", 0);
        node.select("circle").attr("opacity", 1);
        node.select("text").attr("opacity", 1);

        if (tooltipRef.current) {
          tooltipRef.current.style.display = "none";
        }
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

    // Circles — sized by activity
    node
      .append("circle")
      .attr("r", (d) => nodeRadius(d.activity))
      .attr("fill", (d) => getColor(d.domain))
      .attr("stroke", (d) =>
        d.lastState === "on" || d.lastState === "home"
          ? "#fff"
          : "var(--card)"
      )
      .attr("stroke-width", (d) =>
        d.lastState === "on" || d.lastState === "home" ? 2.5 : 1.5
      );

    // Domain icon letter in circle
    node
      .append("text")
      .text((d) => d.domain.charAt(0).toUpperCase())
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "white")
      .attr("font-size", (d) => Math.max(8, nodeRadius(d.activity) * 0.9))
      .attr("font-weight", "600")
      .style("pointer-events", "none");

    // Labels — only for nodes with connections or high activity
    node
      .filter(
        (d) =>
          (linkCount.get(d.id) ?? 0) > 0 || d.activity > 20
      )
      .append("text")
      .text((d) => d.friendlyName || d.entityId)
      .attr("dx", (d) => nodeRadius(d.activity) + 4)
      .attr("dy", 4)
      .attr("class", "fill-foreground")
      .attr("font-size", 10)
      .style("pointer-events", "none")
      .each(function () {
        const el = d3.select(this);
        const text = el.text();
        if (text.length > 25) {
          el.text(text.slice(0, 22) + "…");
        }
      });

    // Area hull rendering helper
    function updateHulls() {
      const areaNodes = new Map<string, [number, number][]>();
      for (const n of simNodes) {
        if (!n.areaId || n.x == null || n.y == null) continue;
        const pts = areaNodes.get(n.areaId) ?? [];
        pts.push([n.x, n.y]);
        areaNodes.set(n.areaId, pts);
      }

      areaHullGroup.selectAll("*").remove();
      for (const [area, points] of areaNodes) {
        if (points.length < 3) continue;
        const hull = d3.polygonHull(points);
        if (!hull) continue;

        // Expand hull slightly
        const cx = d3.mean(hull, (p) => p[0]) ?? 0;
        const cy = d3.mean(hull, (p) => p[1]) ?? 0;
        const expanded = hull.map(([x, y]) => {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const expand = 30;
          return [x + (dx / dist) * expand, y + (dy / dist) * expand] as [
            number,
            number,
          ];
        });

        const areaIdx = uniqueAreas.indexOf(area);
        const hue = (areaIdx * 137) % 360;

        areaHullGroup
          .append("path")
          .attr("d", `M${expanded.map((p) => p.join(",")).join("L")}Z`)
          .attr("fill", `hsla(${hue}, 40%, 50%, 0.06)`)
          .attr("stroke", `hsla(${hue}, 40%, 50%, 0.2)`)
          .attr("stroke-width", 1)
          .attr("stroke-dasharray", "4,2");

        // Area label
        areaHullGroup
          .append("text")
          .attr("x", cx)
          .attr("y", (d3.min(hull, (p) => p[1]) ?? cy) - 14)
          .attr("text-anchor", "middle")
          .attr("fill", `hsla(${hue}, 40%, 60%, 0.6)`)
          .attr("font-size", 11)
          .attr("font-weight", "500")
          .text(area);
      }
    }

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => (d.target as SimNode).x ?? 0)
        .attr("y2", (d) => (d.target as SimNode).y ?? 0);

      edgeLabel
        .attr("x", (d) => (((d.source as SimNode).x ?? 0) + ((d.target as SimNode).x ?? 0)) / 2)
        .attr("y", (d) => (((d.source as SimNode).y ?? 0) + ((d.target as SimNode).y ?? 0)) / 2 - 4);

      node.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);

      updateHulls();
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
          No entities found. Sync your Home Assistant instance to see the graph.
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[600px] border rounded-xl overflow-hidden bg-card">
      <svg ref={svgRef} className="w-full h-full" />
      <div
        ref={tooltipRef}
        className="absolute hidden bg-popover border rounded-lg px-3 py-2 text-xs shadow-lg pointer-events-none z-10 space-y-0.5 max-w-[260px]"
        style={{ display: "none" }}
      />
      {/* Legend */}
      <div className="absolute bottom-3 left-3 bg-card/90 backdrop-blur-sm border rounded-lg px-3 py-2 text-xs space-y-1.5">
        <div className="font-medium text-foreground mb-1">Connections</div>
        <div className="flex items-center gap-2">
          <svg width="24" height="8">
            <line
              x1="0"
              y1="4"
              x2="24"
              y2="4"
              stroke={EDGE_STYLES.automation.color}
              strokeWidth="2"
              markerEnd="url(#arrow-automation)"
            />
          </svg>
          <span>Automation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t-2 border-dashed border-violet-500" />
          <span>Correlation</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t border-dotted border-cyan-500" />
          <span>Same device</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-0 border-t border-dotted border-gray-500 opacity-50" />
          <span>Same area</span>
        </div>
        <div className="font-medium text-foreground mt-2 mb-1">Domains</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(DOMAIN_COLORS)
            .slice(0, 8)
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
        <div className="text-muted-foreground mt-1 pt-1 border-t">
          Node size = activity · Bright ring = on/home
        </div>
      </div>
    </div>
  );
}
