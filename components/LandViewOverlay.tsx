"use client";

import React, { useMemo, useEffect, useState } from "react";
import { Territory, coordToPixel } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";

interface LandViewOverlayProps {
  territories: Record<string, Territory>;
  verboseData: Record<string, TerritoryVerboseData> | null;
  guildColors: Record<string, string>;
  scale?: number;
}

interface TerritoryCluster {
  guildName: string;
  guildPrefix: string;
  guildColor: string;
  territoryNames: string[];
  rectangles: { minX: number; maxX: number; minY: number; maxY: number }[];
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
  centroid: [number, number];
  labelPosition: [number, number]; // Best position for label within polygon
  labelMaxWidth: number;  // Maximum width available for label
  labelMaxHeight: number; // Maximum height available for label
  unionPath: string; // Pre-computed SVG path
}

interface UnionPathResult {
  path: string;
  labelPosition: [number, number];
  labelMaxWidth: number;  // Maximum width available for label at this position
  labelMaxHeight: number; // Maximum height available for label at this position
}

// Stroke width for territory outlines
const STROKE_WIDTH = 4;

// Validate hex color format
function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Get guild color with fallback
function getGuildColor(
  guildName: string,
  guildPrefix: string,
  guildColors: Record<string, string>
): string {
  if (!guildName || guildName === "Unclaimed") {
    return "#808080";
  }

  const candidates = [
    guildColors[guildPrefix],
    guildColors[guildName],
    guildColors[guildPrefix?.toLowerCase()],
    guildColors[guildName.toLowerCase()],
  ];

  for (const color of candidates) {
    if (isValidHexColor(color)) {
      return color;
    }
  }

  return "#FFFFFF";
}

// Get territory rectangle in pixel coordinates
function getTerritoryRect(territory: Territory): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const start = coordToPixel(territory.location.start);
  const end = coordToPixel(territory.location.end);
  return {
    minX: Math.min(start[0], end[0]),
    maxX: Math.max(start[0], end[0]),
    minY: Math.min(start[1], end[1]),
    maxY: Math.max(start[1], end[1]),
  };
}

// Check if two territories are within 100 pixels of each other (edge-to-edge distance)
function areTerritoriesNear(t1: Territory, t2: Territory): boolean {
  const r1 = getTerritoryRect(t1);
  const r2 = getTerritoryRect(t2);

  // Calculate minimum edge-to-edge distance between rectangles
  let xDist = 0;
  if (r1.maxX < r2.minX) {
    xDist = r2.minX - r1.maxX;
  } else if (r2.maxX < r1.minX) {
    xDist = r1.minX - r2.maxX;
  }
  // else they overlap in X, xDist = 0

  let yDist = 0;
  if (r1.maxY < r2.minY) {
    yDist = r2.minY - r1.maxY;
  } else if (r2.maxY < r1.minY) {
    yDist = r1.minY - r2.maxY;
  }
  // else they overlap in Y, yDist = 0

  // Minimum distance between rectangle edges
  const distance = Math.sqrt(xDist * xDist + yDist * yDist);

  // Return true if within 100 pixels edge-to-edge
  // Adjacent/touching rectangles will have distance ~0
  return distance <= 100;
}

// Check if two territories share a trade route
function areTerritoriesConnected(
  name1: string,
  name2: string,
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null
): boolean {
  // Check trading routes in territory data
  const t1 = territories[name1];
  const t2 = territories[name2];

  // Check t1's trading routes (from main territory data)
  if (t1?.["Trading Routes"]?.includes(name2)) return true;

  // Check t2's trading routes (from main territory data - bidirectional)
  if (t2?.["Trading Routes"]?.includes(name1)) return true;

  // Check verbose data (static trade routes from territories_verbose.json)
  if (verboseData && Object.keys(verboseData).length > 0) {
    const v1 = verboseData[name1];
    const v2 = verboseData[name2];

    // Check if name1 has a route to name2
    if (v1?.["Trading Routes"]?.includes(name2)) {
      return true;
    }

    // Check if name2 has a route to name1 (bidirectional)
    if (v2?.["Trading Routes"]?.includes(name1)) {
      return true;
    }
  }

  return false;
}

// Result of clustering includes both territory names and trade route connections
interface ClusterResult {
  territoryNames: string[];
  tradeRouteConnections: [string, string][]; // pairs of territory names connected by trade routes
}

// Find connected components using BFS
function findConnectedClusters(
  territoryNames: string[],
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null
): ClusterResult[] {
  const visited = new Set<string>();
  const clusters: ClusterResult[] = [];

  for (const startName of territoryNames) {
    if (visited.has(startName)) continue;

    const cluster: string[] = [];
    const tradeRouteConnections: [string, string][] = [];
    const queue = [startName];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      cluster.push(current);

      // Find adjacent territories
      for (const otherName of territoryNames) {
        if (visited.has(otherName)) continue;

        const currentTerr = territories[current];
        const otherTerr = territories[otherName];

        // Check if connected by trade route OR within 100 pixels
        const connectedByRoute = areTerritoriesConnected(
          current,
          otherName,
          territories,
          verboseData
        );
        const connectedByProximity = areTerritoriesNear(currentTerr, otherTerr);

        if (connectedByRoute || connectedByProximity) {
          queue.push(otherName);
          // Track trade route connections so we can draw bridges
          if (connectedByRoute) {
            tradeRouteConnections.push([current, otherName]);
          }
        }
      }
    }

    if (cluster.length > 0) {
      clusters.push({ territoryNames: cluster, tradeRouteConnections });
    }
  }

  return clusters;
}

// Create a bridge rectangle connecting two territories
// The bridge spans the full overlapping edge between territories
function createBridgeRectangle(
  t1: Territory,
  t2: Territory
): { minX: number; maxX: number; minY: number; maxY: number } {
  const r1 = getTerritoryRect(t1);
  const r2 = getTerritoryRect(t2);

  // Calculate overlaps in each dimension
  const xOverlapStart = Math.max(r1.minX, r2.minX);
  const xOverlapEnd = Math.min(r1.maxX, r2.maxX);
  const yOverlapStart = Math.max(r1.minY, r2.minY);
  const yOverlapEnd = Math.min(r1.maxY, r2.maxY);

  const xOverlap = xOverlapEnd - xOverlapStart;
  const yOverlap = yOverlapEnd - yOverlapStart;

  // Determine if territories are primarily separated horizontally or vertically
  const xGap = Math.max(r1.minX, r2.minX) - Math.min(r1.maxX, r2.maxX);
  const yGap = Math.max(r1.minY, r2.minY) - Math.min(r1.maxY, r2.maxY);

  if (xOverlap > 0 && yGap > 0) {
    // Territories overlap in X, gap in Y - create vertical bridge spanning full X overlap
    return {
      minX: xOverlapStart,
      maxX: xOverlapEnd,
      minY: Math.min(r1.maxY, r2.maxY),
      maxY: Math.max(r1.minY, r2.minY),
    };
  } else if (yOverlap > 0 && xGap > 0) {
    // Territories overlap in Y, gap in X - create horizontal bridge spanning full Y overlap
    return {
      minX: Math.min(r1.maxX, r2.maxX),
      maxX: Math.max(r1.minX, r2.minX),
      minY: yOverlapStart,
      maxY: yOverlapEnd,
    };
  } else {
    // Diagonal gap or touching - create a bridge connecting the closest corners
    // Find closest edges
    const centerX1 = (r1.minX + r1.maxX) / 2;
    const centerY1 = (r1.minY + r1.maxY) / 2;
    const centerX2 = (r2.minX + r2.maxX) / 2;
    const centerY2 = (r2.minY + r2.maxY) / 2;

    // Use the smaller territory's dimension for bridge width in diagonal cases
    const minWidth = Math.min(
      r1.maxX - r1.minX,
      r1.maxY - r1.minY,
      r2.maxX - r2.minX,
      r2.maxY - r2.minY
    );
    const bridgeWidth = minWidth * 0.6; // 60% of smallest dimension
    const halfWidth = bridgeWidth / 2;

    return {
      minX: Math.min(centerX1, centerX2) - halfWidth,
      maxX: Math.max(centerX1, centerX2) + halfWidth,
      minY: Math.min(centerY1, centerY2) - halfWidth,
      maxY: Math.max(centerY1, centerY2) + halfWidth,
    };
  }
}

// Compute the union of axis-aligned rectangles as a rectilinear polygon
// Returns an SVG path with only horizontal and vertical segments
function computeRectilinearUnionPath(
  rectangles: { minX: number; maxX: number; minY: number; maxY: number }[],
  centroid: [number, number]
): UnionPathResult {
  if (rectangles.length === 0) return { path: "", labelPosition: centroid, labelMaxWidth: 0, labelMaxHeight: 0 };

  // Expand rectangles slightly to fill small gaps between adjacent territories
  const GAP_FILL = 3;
  const expandedRects = rectangles.map((r) => ({
    minX: r.minX - GAP_FILL,
    maxX: r.maxX + GAP_FILL,
    minY: r.minY - GAP_FILL,
    maxY: r.maxY + GAP_FILL,
  }));

  // Single rectangle - simple case
  if (expandedRects.length === 1) {
    const r = expandedRects[0];
    return {
      path: `M ${r.minX} ${r.minY} H ${r.maxX} V ${r.maxY} H ${r.minX} Z`,
      labelPosition: [(r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2],
      labelMaxWidth: r.maxX - r.minX,
      labelMaxHeight: r.maxY - r.minY
    };
  }

  // Get unique coordinates to create a grid
  const xSet = new Set<number>();
  const ySet = new Set<number>();
  for (const rect of expandedRects) {
    xSet.add(rect.minX);
    xSet.add(rect.maxX);
    ySet.add(rect.minY);
    ySet.add(rect.maxY);
  }
  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  const xLen = xs.length - 1;
  const yLen = ys.length - 1;

  // Create grid
  const grid = new Uint8Array(xLen * yLen);

  // Build index maps for O(1) lookups
  const xIndexMap = new Map<number, number>();
  const yIndexMap = new Map<number, number>();
  xs.forEach((x, i) => xIndexMap.set(x, i));
  ys.forEach((y, i) => yIndexMap.set(y, i));

  // Fill grid based on rectangles
  for (const rect of expandedRects) {
    const iStart = xIndexMap.get(rect.minX)!;
    const iEnd = xIndexMap.get(rect.maxX)!;
    const jStart = yIndexMap.get(rect.minY)!;
    const jEnd = yIndexMap.get(rect.maxY)!;

    for (let i = iStart; i < iEnd; i++) {
      for (let j = jStart; j < jEnd; j++) {
        grid[i * yLen + j] = 1;
      }
    }
  }

  // Fill narrow gaps (< 100px) between parallel edges
  const GAP_THRESHOLD = 100;

  // Horizontal gap filling
  for (let j = 0; j < yLen; j++) {
    let lastFilledI = -1;
    for (let i = 0; i < xLen; i++) {
      if (grid[i * yLen + j] === 1) {
        if (lastFilledI >= 0 && lastFilledI < i - 1) {
          const gapWidth = xs[i] - xs[lastFilledI + 1];
          if (gapWidth < GAP_THRESHOLD) {
            for (let fillI = lastFilledI + 1; fillI < i; fillI++) {
              grid[fillI * yLen + j] = 1;
            }
          }
        }
        lastFilledI = i;
      }
    }
  }

  // Vertical gap filling
  for (let i = 0; i < xLen; i++) {
    let lastFilledJ = -1;
    for (let j = 0; j < yLen; j++) {
      if (grid[i * yLen + j] === 1) {
        if (lastFilledJ >= 0 && lastFilledJ < j - 1) {
          const gapHeight = ys[j] - ys[lastFilledJ + 1];
          if (gapHeight < GAP_THRESHOLD) {
            for (let fillJ = lastFilledJ + 1; fillJ < j; fillJ++) {
              grid[i * yLen + fillJ] = 1;
            }
          }
        }
        lastFilledJ = j;
      }
    }
  }

  // Fill air pockets using flood fill from edges
  const exterior = new Uint8Array(xLen * yLen);
  const queue: number[] = [];

  // Add edge cells to queue
  for (let i = 0; i < xLen; i++) {
    if (grid[i * yLen] === 0) { exterior[i * yLen] = 1; queue.push(i * yLen); }
    if (grid[i * yLen + yLen - 1] === 0) { exterior[i * yLen + yLen - 1] = 1; queue.push(i * yLen + yLen - 1); }
  }
  for (let j = 0; j < yLen; j++) {
    if (grid[j] === 0) { exterior[j] = 1; queue.push(j); }
    if (grid[(xLen - 1) * yLen + j] === 0) { exterior[(xLen - 1) * yLen + j] = 1; queue.push((xLen - 1) * yLen + j); }
  }

  // BFS flood fill
  while (queue.length > 0) {
    const idx = queue.pop()!;
    const i = Math.floor(idx / yLen);
    const j = idx % yLen;
    for (const [ni, nj] of [[i-1,j], [i+1,j], [i,j-1], [i,j+1]]) {
      if (ni >= 0 && ni < xLen && nj >= 0 && nj < yLen) {
        const nIdx = ni * yLen + nj;
        if (grid[nIdx] === 0 && exterior[nIdx] === 0) {
          exterior[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }
  }

  // Fill air pockets
  for (let i = 0; i < xLen; i++) {
    for (let j = 0; j < yLen; j++) {
      const idx = i * yLen + j;
      if (grid[idx] === 0 && exterior[idx] === 0) grid[idx] = 1;
    }
  }

  // Helper to check if cell is filled
  const isFilled = (i: number, j: number): boolean => {
    if (i < 0 || i >= xLen || j < 0 || j >= yLen) return false;
    return grid[i * yLen + j] === 1;
  };

  // Collect boundary edges
  interface Point { x: number; y: number; }
  interface DirectedEdge { from: Point; to: Point; }
  const edges: DirectedEdge[] = [];

  for (let j = 0; j <= yLen; j++) {
    for (let i = 0; i < xLen; i++) {
      const above = isFilled(i, j - 1);
      const below = isFilled(i, j);
      if (below && !above) edges.push({ from: { x: xs[i], y: ys[j] }, to: { x: xs[i + 1], y: ys[j] } });
      else if (above && !below) edges.push({ from: { x: xs[i + 1], y: ys[j] }, to: { x: xs[i], y: ys[j] } });
    }
  }

  for (let i = 0; i <= xLen; i++) {
    for (let j = 0; j < yLen; j++) {
      const left = isFilled(i - 1, j);
      const right = isFilled(i, j);
      if (left && !right) edges.push({ from: { x: xs[i], y: ys[j] }, to: { x: xs[i], y: ys[j + 1] } });
      else if (right && !left) edges.push({ from: { x: xs[i], y: ys[j + 1] }, to: { x: xs[i], y: ys[j] } });
    }
  }

  if (edges.length === 0) return { path: "", labelPosition: centroid, labelMaxWidth: 0, labelMaxHeight: 0 };

  // Build adjacency map for edge chaining
  const pointKey = (p: Point) => `${p.x},${p.y}`;
  const edgeMap = new Map<string, DirectedEdge[]>();
  for (const edge of edges) {
    const key = pointKey(edge.from);
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(edge);
  }

  // Trace closed paths
  const paths: string[] = [];
  const usedEdges = new Set<DirectedEdge>();

  for (const startEdge of edges) {
    if (usedEdges.has(startEdge)) continue;

    const pathPoints: Point[] = [startEdge.from];
    let currentEdge = startEdge;

    while (true) {
      usedEdges.add(currentEdge);
      pathPoints.push(currentEdge.to);

      const nextEdges = edgeMap.get(pointKey(currentEdge.to)) || [];
      const nextEdge = nextEdges.find((e) => !usedEdges.has(e));

      if (!nextEdge) break;
      if (nextEdge.to.x === startEdge.from.x && nextEdge.to.y === startEdge.from.y) {
        usedEdges.add(nextEdge);
        break;
      }
      currentEdge = nextEdge;
    }

    if (pathPoints.length > 2) {
      let path = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
      for (let i = 1; i < pathPoints.length; i++) {
        const prev = pathPoints[i - 1];
        const curr = pathPoints[i];
        path += curr.x === prev.x ? ` V ${curr.y}` : ` H ${curr.x}`;
      }
      path += " Z";
      paths.push(path);
    }
  }

  // Calculate bounding box for label dimensions
  const minX = xs[0];
  const maxX = xs[xLen];
  const minY = ys[0];
  const maxY = ys[yLen];

  return {
    path: paths.join(" "),
    labelPosition: centroid,
    labelMaxWidth: maxX - minX,
    labelMaxHeight: maxY - minY
  };
}

const LandViewOverlay = React.memo(function LandViewOverlay({
  territories,
  verboseData: propVerboseData,
  guildColors,
  scale = 1,
}: LandViewOverlayProps) {
  // Fallback: load verbose data directly if not provided
  const [localVerboseData, setLocalVerboseData] = useState<Record<string, TerritoryVerboseData> | null>(null);

  useEffect(() => {
    // If propVerboseData is null or empty, load it directly
    if (!propVerboseData || Object.keys(propVerboseData).length === 0) {
      fetch("/territories_verbose.json")
        .then((res) => res.json())
        .then((data) => {
          setLocalVerboseData(data);
        })
        .catch((err) => console.error("LandViewOverlay: Failed to load verbose data", err));
    }
  }, [propVerboseData]);

  // Use prop data if available, otherwise use locally loaded data
  const verboseData = propVerboseData && Object.keys(propVerboseData).length > 0
    ? propVerboseData
    : localVerboseData;

  // Compute clusters for all guilds
  const clusters = useMemo(() => {
    const result: TerritoryCluster[] = [];

    // Group territories by guild
    const guildTerritories: Record<
      string,
      { names: string[]; prefix: string }
    > = {};

    for (const [name, territory] of Object.entries(territories)) {
      const guildName = territory.guild.name;
      if (!guildName || guildName === "Unclaimed") continue;

      if (!guildTerritories[guildName]) {
        guildTerritories[guildName] = {
          names: [],
          prefix: territory.guild.prefix,
        };
      }
      guildTerritories[guildName].names.push(name);
    }

    // For each guild, find connected clusters
    for (const [guildName, data] of Object.entries(guildTerritories)) {
      const connectedClusters = findConnectedClusters(
        data.names,
        territories,
        verboseData
      );

      for (const clusterResult of connectedClusters) {
        const { territoryNames: clusterNames, tradeRouteConnections } = clusterResult;

        // Calculate rectangles and bounding box
        const rectangles: {
          minX: number;
          maxX: number;
          minY: number;
          maxY: number;
        }[] = [];
        let minX = Infinity,
          maxX = -Infinity,
          minY = Infinity,
          maxY = -Infinity;

        // Add territory rectangles
        for (const name of clusterNames) {
          const territory = territories[name];
          const rect = getTerritoryRect(territory);
          rectangles.push(rect);

          minX = Math.min(minX, rect.minX);
          maxX = Math.max(maxX, rect.maxX);
          minY = Math.min(minY, rect.minY);
          maxY = Math.max(maxY, rect.maxY);
        }

        // Add bridge rectangles for trade route connections
        // This fills the space between connected territories
        for (const [name1, name2] of tradeRouteConnections) {
          const t1 = territories[name1];
          const t2 = territories[name2];
          if (t1 && t2) {
            const bridge = createBridgeRectangle(t1, t2);
            rectangles.push(bridge);

            // Update bounding box to include bridge
            minX = Math.min(minX, bridge.minX);
            maxX = Math.max(maxX, bridge.maxX);
            minY = Math.min(minY, bridge.minY);
            maxY = Math.max(maxY, bridge.maxY);
          }
        }

        const guildColor = getGuildColor(guildName, data.prefix, guildColors);

        // Pre-compute the union path and label position for this cluster
        const clusterCentroid: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
        const { path: unionPath, labelPosition, labelMaxWidth, labelMaxHeight } = computeRectilinearUnionPath(rectangles, clusterCentroid);

        result.push({
          guildName,
          guildPrefix: data.prefix,
          guildColor,
          territoryNames: clusterNames,
          rectangles,
          boundingBox: { minX, maxX, minY, maxY },
          centroid: clusterCentroid,
          labelPosition,
          labelMaxWidth,
          labelMaxHeight,
          unionPath,
        });
      }
    }

    return result;
  }, [territories, verboseData, guildColors]);

  const zoom = scale;

  return (
    <svg
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "visible",
        willChange: "transform",
        contain: "layout style paint",
      }}
    >
      {clusters.map((cluster, index) => {
        const { boundingBox, labelPosition, labelMaxWidth, labelMaxHeight, guildPrefix, guildColor, unionPath } = cluster;

        // Calculate font size to fit within the inscribed rectangle
        const boxWidth = boundingBox.maxX - boundingBox.minX;
        let fontSize = Math.max(12, Math.min(64, boxWidth / 4) / zoom);

        // Constrain text to fit within the available label area
        if (guildPrefix && labelMaxWidth > 0 && labelMaxHeight > 0) {
          const chars = guildPrefix.length;
          // Approximate text width: chars * fontSize * 0.65 (accounting for letter spacing)
          // Approximate text height: fontSize * 1.2
          const charWidthFactor = 0.65;
          const heightFactor = 1.2;

          // Add padding to keep text away from edges
          const padding = 8;
          const availableWidth = labelMaxWidth - padding * 2;
          const availableHeight = labelMaxHeight - padding * 2;

          // Calculate max font size that fits width
          const maxFontByWidth = availableWidth / (chars * charWidthFactor);
          // Calculate max font size that fits height
          const maxFontByHeight = availableHeight / heightFactor;

          // Use the smaller of the two constraints
          const maxFontSize = Math.min(maxFontByWidth, maxFontByHeight);
          fontSize = Math.min(fontSize, maxFontSize);
        }

        fontSize = Math.max(8, fontSize); // Lower minimum to allow text to fit
        const strokeWidth = Math.min(fontSize * 0.15, 4);

        return (
          <g key={`cluster-${cluster.guildName}-${index}`}>
            <path
              d={unionPath}
              fill={guildColor + "40"}
              stroke={guildColor}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="miter"
            />
            <text
              x={labelPosition[0]}
              y={labelPosition[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: `${fontSize}px`,
                fontWeight: "bold",
                fontFamily: "Arial Black, Arial, sans-serif",
                letterSpacing: "2px",
                fill: "#ffffff",
                stroke: "#000000",
                strokeWidth: `${strokeWidth}px`,
                paintOrder: "stroke fill",
              }}
            >
              {guildPrefix}
            </text>
          </g>
        );
      })}
    </svg>
  );
});

export default LandViewOverlay;
