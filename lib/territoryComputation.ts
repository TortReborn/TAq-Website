import { Territory, coordToPixel } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";

// Exported interfaces
export interface TerritoryCluster {
  guildName: string;
  guildPrefix: string;
  guildColor: string;
  territoryNames: string[];
  rectangles: { minX: number; maxX: number; minY: number; maxY: number }[];
  boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
  centroid: [number, number];
  labelPosition: [number, number];
  labelMaxWidth: number;
  labelMaxHeight: number;
  unionPath: string;
}

export interface UnionPathResult {
  path: string;
  labelPosition: [number, number];
  labelMaxWidth: number;
  labelMaxHeight: number;
}

// Stroke width for territory outlines
export const STROKE_WIDTH = 4;

// Validate hex color format
export function isValidHexColor(color: string | undefined): boolean {
  if (!color) return false;
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Get guild color with fallback
export function getGuildColor(
  guildName: string,
  guildPrefix: string,
  guildColors: Record<string, string>,
  fallbackColor: string = "#FFFFFF"
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

  return fallbackColor;
}

// Get territory rectangle in pixel coordinates
export function getTerritoryRect(territory: Territory): {
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
export function areTerritoriesNear(t1: Territory, t2: Territory): boolean {
  const r1 = getTerritoryRect(t1);
  const r2 = getTerritoryRect(t2);

  let xDist = 0;
  if (r1.maxX < r2.minX) {
    xDist = r2.minX - r1.maxX;
  } else if (r2.maxX < r1.minX) {
    xDist = r1.minX - r2.maxX;
  }

  let yDist = 0;
  if (r1.maxY < r2.minY) {
    yDist = r2.minY - r1.maxY;
  } else if (r2.maxY < r1.minY) {
    yDist = r1.minY - r2.maxY;
  }

  const distance = Math.sqrt(xDist * xDist + yDist * yDist);
  return distance <= 100;
}

// Check if two territories share a trade route
export function areTerritoriesConnected(
  name1: string,
  name2: string,
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null
): boolean {
  const t1 = territories[name1];
  const t2 = territories[name2];

  if (t1?.["Trading Routes"]?.includes(name2)) return true;
  if (t2?.["Trading Routes"]?.includes(name1)) return true;

  if (verboseData && Object.keys(verboseData).length > 0) {
    const v1 = verboseData[name1];
    const v2 = verboseData[name2];

    if (v1?.["Trading Routes"]?.includes(name2)) return true;
    if (v2?.["Trading Routes"]?.includes(name1)) return true;
  }

  return false;
}

// Result of clustering includes both territory names and trade route connections
interface ClusterResult {
  territoryNames: string[];
  tradeRouteConnections: [string, string][];
}

// Find connected components using BFS
export function findConnectedClusters(
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

      for (const otherName of territoryNames) {
        if (visited.has(otherName)) continue;

        const currentTerr = territories[current];
        const otherTerr = territories[otherName];

        const connectedByRoute = areTerritoriesConnected(
          current,
          otherName,
          territories,
          verboseData
        );
        const connectedByProximity = areTerritoriesNear(currentTerr, otherTerr);

        if (connectedByRoute || connectedByProximity) {
          queue.push(otherName);
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
export function createBridgeRectangle(
  t1: Territory,
  t2: Territory
): { minX: number; maxX: number; minY: number; maxY: number } {
  const r1 = getTerritoryRect(t1);
  const r2 = getTerritoryRect(t2);

  const xOverlapStart = Math.max(r1.minX, r2.minX);
  const xOverlapEnd = Math.min(r1.maxX, r2.maxX);
  const yOverlapStart = Math.max(r1.minY, r2.minY);
  const yOverlapEnd = Math.min(r1.maxY, r2.maxY);

  const xOverlap = xOverlapEnd - xOverlapStart;
  const yOverlap = yOverlapEnd - yOverlapStart;

  const xGap = Math.max(r1.minX, r2.minX) - Math.min(r1.maxX, r2.maxX);
  const yGap = Math.max(r1.minY, r2.minY) - Math.min(r1.maxY, r2.maxY);

  if (xOverlap > 0 && yGap > 0) {
    return {
      minX: xOverlapStart,
      maxX: xOverlapEnd,
      minY: Math.min(r1.maxY, r2.maxY),
      maxY: Math.max(r1.minY, r2.minY),
    };
  } else if (yOverlap > 0 && xGap > 0) {
    return {
      minX: Math.min(r1.maxX, r2.maxX),
      maxX: Math.max(r1.minX, r2.minX),
      minY: yOverlapStart,
      maxY: yOverlapEnd,
    };
  } else {
    const centerX1 = (r1.minX + r1.maxX) / 2;
    const centerY1 = (r1.minY + r1.maxY) / 2;
    const centerX2 = (r2.minX + r2.maxX) / 2;
    const centerY2 = (r2.minY + r2.maxY) / 2;

    const minWidth = Math.min(
      r1.maxX - r1.minX,
      r1.maxY - r1.minY,
      r2.maxX - r2.minX,
      r2.maxY - r2.minY
    );
    const bridgeWidth = minWidth * 0.6;
    const halfWidth = bridgeWidth / 2;

    return {
      minX: Math.min(centerX1, centerX2) - halfWidth,
      maxX: Math.max(centerX1, centerX2) + halfWidth,
      minY: Math.min(centerY1, centerY2) - halfWidth,
      maxY: Math.max(centerY1, centerY2) + halfWidth,
    };
  }
}

// Check if a label rectangle fits entirely within the filled polygon
function isLabelWithinPolygon(
  centerX: number,
  centerY: number,
  labelWidth: number,
  labelHeight: number,
  xs: number[],
  ys: number[],
  grid: Uint8Array,
  xLen: number,
  yLen: number
): boolean {
  const halfWidth = labelWidth / 2;
  const halfHeight = labelHeight / 2;

  const labelMinX = centerX - halfWidth;
  const labelMaxX = centerX + halfWidth;
  const labelMinY = centerY - halfHeight;
  const labelMaxY = centerY + halfHeight;

  if (labelMinX < xs[0] || labelMaxX > xs[xLen] ||
      labelMinY < ys[0] || labelMaxY > ys[yLen]) {
    return false;
  }

  let iStart = 0, iEnd = xLen;
  let jStart = 0, jEnd = yLen;

  for (let i = 0; i < xLen; i++) {
    if (xs[i + 1] <= labelMinX) iStart = i + 1;
    if (xs[i] >= labelMaxX && iEnd === xLen) iEnd = i;
  }
  for (let j = 0; j < yLen; j++) {
    if (ys[j + 1] <= labelMinY) jStart = j + 1;
    if (ys[j] >= labelMaxY && jEnd === yLen) jEnd = j;
  }

  for (let i = iStart; i < iEnd; i++) {
    for (let j = jStart; j < jEnd; j++) {
      if (grid[i * yLen + j] !== 1) {
        return false;
      }
    }
  }

  return true;
}

// Compute the union of axis-aligned rectangles as a rectilinear polygon
export function computeRectilinearUnionPath(
  rectangles: { minX: number; maxX: number; minY: number; maxY: number }[],
  centroid: [number, number],
  estimatedLabelWidth: number = 100,
  estimatedLabelHeight: number = 30,
  excludedRectangles: { minX: number; maxX: number; minY: number; maxY: number }[] = []
): UnionPathResult {
  if (rectangles.length === 0) return { path: "", labelPosition: centroid, labelMaxWidth: 0, labelMaxHeight: 0 };

  const GAP_FILL = 3;
  const expandedRects = rectangles.map((r) => ({
    minX: r.minX - GAP_FILL,
    maxX: r.maxX + GAP_FILL,
    minY: r.minY - GAP_FILL,
    maxY: r.maxY + GAP_FILL,
  }));

  if (expandedRects.length === 1 && excludedRectangles.length === 0) {
    const r = expandedRects[0];
    return {
      path: `M ${r.minX} ${r.minY} H ${r.maxX} V ${r.maxY} H ${r.minX} Z`,
      labelPosition: [(r.minX + r.maxX) / 2, (r.minY + r.maxY) / 2],
      labelMaxWidth: r.maxX - r.minX,
      labelMaxHeight: r.maxY - r.minY
    };
  }

  const xSet = new Set<number>();
  const ySet = new Set<number>();
  for (const rect of expandedRects) {
    xSet.add(rect.minX);
    xSet.add(rect.maxX);
    ySet.add(rect.minY);
    ySet.add(rect.maxY);
  }
  for (const rect of excludedRectangles) {
    xSet.add(rect.minX);
    xSet.add(rect.maxX);
    ySet.add(rect.minY);
    ySet.add(rect.maxY);
  }
  const xs = Array.from(xSet).sort((a, b) => a - b);
  const ys = Array.from(ySet).sort((a, b) => a - b);

  const xLen = xs.length - 1;
  const yLen = ys.length - 1;

  const grid = new Uint8Array(xLen * yLen);

  const xIndexMap = new Map<number, number>();
  const yIndexMap = new Map<number, number>();
  xs.forEach((x, i) => xIndexMap.set(x, i));
  ys.forEach((y, i) => yIndexMap.set(y, i));

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

  for (const rect of excludedRectangles) {
    const iStart = xIndexMap.get(rect.minX);
    const iEnd = xIndexMap.get(rect.maxX);
    const jStart = yIndexMap.get(rect.minY);
    const jEnd = yIndexMap.get(rect.maxY);

    if (iStart !== undefined && iEnd !== undefined && jStart !== undefined && jEnd !== undefined) {
      for (let i = iStart; i < iEnd; i++) {
        for (let j = jStart; j < jEnd; j++) {
          grid[i * yLen + j] = 2;
        }
      }
    }
  }

  const skipAdvancedProcessing = xLen <= 2 && yLen <= 2;

  if (!skipAdvancedProcessing) {
    const GAP_THRESHOLD = 100;

    for (let j = 0; j < yLen; j++) {
      let lastFilledI = -1;
      for (let i = 0; i < xLen; i++) {
        if (grid[i * yLen + j] === 1) {
          if (lastFilledI >= 0 && lastFilledI < i - 1) {
            const gapWidth = xs[i] - xs[lastFilledI + 1];
            if (gapWidth < GAP_THRESHOLD) {
              let hasExcluded = false;
              for (let fillI = lastFilledI + 1; fillI < i; fillI++) {
                if (grid[fillI * yLen + j] === 2) { hasExcluded = true; break; }
              }
              if (!hasExcluded) {
                for (let fillI = lastFilledI + 1; fillI < i; fillI++) {
                  grid[fillI * yLen + j] = 1;
                }
              }
            }
          }
          lastFilledI = i;
        }
      }
    }

    for (let i = 0; i < xLen; i++) {
      let lastFilledJ = -1;
      for (let j = 0; j < yLen; j++) {
        if (grid[i * yLen + j] === 1) {
          if (lastFilledJ >= 0 && lastFilledJ < j - 1) {
            const gapHeight = ys[j] - ys[lastFilledJ + 1];
            if (gapHeight < GAP_THRESHOLD) {
              let hasExcluded = false;
              for (let fillJ = lastFilledJ + 1; fillJ < j; fillJ++) {
                if (grid[i * yLen + fillJ] === 2) { hasExcluded = true; break; }
              }
              if (!hasExcluded) {
                for (let fillJ = lastFilledJ + 1; fillJ < j; fillJ++) {
                  grid[i * yLen + fillJ] = 1;
                }
              }
            }
          }
          lastFilledJ = j;
        }
      }
    }

    const exterior = new Uint8Array(xLen * yLen);
    const queue: number[] = [];

    for (let i = 0; i < xLen; i++) {
      for (let j = 0; j < yLen; j++) {
        if (grid[i * yLen + j] === 2) {
          exterior[i * yLen + j] = 1;
          queue.push(i * yLen + j);
        }
      }
    }

    for (let i = 0; i < xLen; i++) {
      if (grid[i * yLen] === 0) { exterior[i * yLen] = 1; queue.push(i * yLen); }
      if (grid[i * yLen + yLen - 1] === 0) { exterior[i * yLen + yLen - 1] = 1; queue.push(i * yLen + yLen - 1); }
    }
    for (let j = 0; j < yLen; j++) {
      if (grid[j] === 0) { exterior[j] = 1; queue.push(j); }
      if (grid[(xLen - 1) * yLen + j] === 0) { exterior[(xLen - 1) * yLen + j] = 1; queue.push((xLen - 1) * yLen + j); }
    }

    while (queue.length > 0) {
      const idx = queue.pop()!;
      const i = Math.floor(idx / yLen);
      const j = idx % yLen;
      for (const [ni, nj] of [[i-1,j], [i+1,j], [i,j-1], [i,j+1]]) {
        if (ni >= 0 && ni < xLen && nj >= 0 && nj < yLen) {
          const nIdx = ni * yLen + nj;
          if ((grid[nIdx] === 0 || grid[nIdx] === 2) && exterior[nIdx] === 0) {
            exterior[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }

    for (let i = 0; i < xLen; i++) {
      for (let j = 0; j < yLen; j++) {
        const idx = i * yLen + j;
        if (grid[idx] === 0 && exterior[idx] === 0) grid[idx] = 1;
      }
    }
  }

  const isFilled = (i: number, j: number): boolean => {
    if (i < 0 || i >= xLen || j < 0 || j >= yLen) return false;
    return grid[i * yLen + j] === 1;
  };

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

  const pointKey = (p: Point) => `${p.x},${p.y}`;
  const edgeMap = new Map<string, DirectedEdge[]>();
  for (const edge of edges) {
    const key = pointKey(edge.from);
    if (!edgeMap.has(key)) edgeMap.set(key, []);
    edgeMap.get(key)!.push(edge);
  }

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

  let totalArea = 0;
  let weightedX = 0;
  let weightedY = 0;

  for (let i = 0; i < xLen; i++) {
    for (let j = 0; j < yLen; j++) {
      if (grid[i * yLen + j] === 1) {
        const cellWidth = xs[i + 1] - xs[i];
        const cellHeight = ys[j + 1] - ys[j];
        const cellArea = cellWidth * cellHeight;
        const cellCenterX = (xs[i] + xs[i + 1]) / 2;
        const cellCenterY = (ys[j] + ys[j + 1]) / 2;

        totalArea += cellArea;
        weightedX += cellCenterX * cellArea;
        weightedY += cellCenterY * cellArea;
      }
    }
  }

  const trueCentroid: [number, number] = totalArea > 0
    ? [weightedX / totalArea, weightedY / totalArea]
    : centroid;

  let bestLabelPos: [number, number] = trueCentroid;
  let bestWidth = estimatedLabelWidth;
  let bestHeight = estimatedLabelHeight;

  const boundMinX = xs[0];
  const boundMaxX = xs[xLen];
  const boundMinY = ys[0];
  const boundMaxY = ys[yLen];

  const findFittingPosition = (width: number, height: number): [number, number] | null => {
    if (isLabelWithinPolygon(trueCentroid[0], trueCentroid[1], width, height, xs, ys, grid, xLen, yLen)) {
      return trueCentroid;
    }

    const searchStep = 20;
    const maxSearchRadius = Math.max(boundMaxX - boundMinX, boundMaxY - boundMinY) / 2;

    for (let radius = searchStep; radius <= maxSearchRadius; radius += searchStep) {
      const numSamples = Math.max(4, Math.floor(radius / searchStep) * 4);
      for (let i = 0; i < numSamples; i++) {
        const angle = (i / numSamples) * Math.PI * 2;
        const testX = trueCentroid[0] + Math.cos(angle) * radius;
        const testY = trueCentroid[1] + Math.sin(angle) * radius;

        if (isLabelWithinPolygon(testX, testY, width, height, xs, ys, grid, xLen, yLen)) {
          return [testX, testY];
        }
      }
    }

    return null;
  };

  const START_SCALE = 1.0;
  const MAX_SCALE = 4.0;
  let currentScale = START_SCALE;
  let lastFittingScale = 0;
  let lastFittingPos: [number, number] | null = null;

  let pos = findFittingPosition(estimatedLabelWidth, estimatedLabelHeight);

  if (pos) {
    lastFittingScale = START_SCALE;
    lastFittingPos = pos;

    currentScale = START_SCALE * 2;
    while (currentScale <= MAX_SCALE) {
      const testWidth = estimatedLabelWidth * currentScale;
      const testHeight = estimatedLabelHeight * currentScale;
      pos = findFittingPosition(testWidth, testHeight);

      if (pos) {
        lastFittingScale = currentScale;
        lastFittingPos = pos;
        currentScale *= 2;
      } else {
        break;
      }
    }

    if (lastFittingScale > MAX_SCALE) lastFittingScale = MAX_SCALE;

    bestLabelPos = lastFittingPos;
    bestWidth = estimatedLabelWidth * lastFittingScale;
    bestHeight = estimatedLabelHeight * lastFittingScale;
  } else {
    bestWidth = boundMaxX - boundMinX;
    bestHeight = boundMaxY - boundMinY;
  }

  return {
    path: paths.join(" "),
    labelPosition: bestLabelPos,
    labelMaxWidth: bestWidth,
    labelMaxHeight: bestHeight
  };
}

// Main computation function - extracts all the logic from LandViewOverlay's useMemo
export function computeLandViewClusters(
  territories: Record<string, Territory>,
  verboseData: Record<string, TerritoryVerboseData> | null,
  guildColors: Record<string, string>,
  fallbackColor: string = "#FFFFFF"
): TerritoryCluster[] {
  // Group territories by guild
  const guildTerritories: Record<string, { names: string[]; prefix: string }> = {};

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

  // Phase 1: Collect all clusters with their rectangles and calculate area
  interface PreCluster {
    guildName: string;
    guildPrefix: string;
    guildColor: string;
    territoryNames: string[];
    rectangles: { minX: number; maxX: number; minY: number; maxY: number }[];
    boundingBox: { minX: number; maxX: number; minY: number; maxY: number };
    centroid: [number, number];
    totalArea: number;
    estimatedLabelWidth: number;
    estimatedLabelHeight: number;
  }

  const preClusters: PreCluster[] = [];

  for (const [guildName, data] of Object.entries(guildTerritories)) {
    const connectedClusters = findConnectedClusters(
      data.names,
      territories,
      verboseData
    );

    for (const clusterResult of connectedClusters) {
      const { territoryNames: clusterNames, tradeRouteConnections } = clusterResult;

      const rectangles: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      let totalArea = 0;

      for (const name of clusterNames) {
        const territory = territories[name];
        const rect = getTerritoryRect(territory);
        rectangles.push(rect);
        totalArea += (rect.maxX - rect.minX) * (rect.maxY - rect.minY);

        minX = Math.min(minX, rect.minX);
        maxX = Math.max(maxX, rect.maxX);
        minY = Math.min(minY, rect.minY);
        maxY = Math.max(maxY, rect.maxY);
      }

      for (const [name1, name2] of tradeRouteConnections) {
        const t1 = territories[name1];
        const t2 = territories[name2];
        if (t1 && t2) {
          const bridge = createBridgeRectangle(t1, t2);
          rectangles.push(bridge);

          minX = Math.min(minX, bridge.minX);
          maxX = Math.max(maxX, bridge.maxX);
          minY = Math.min(minY, bridge.minY);
          maxY = Math.max(maxY, bridge.maxY);
        }
      }

      const guildColor = getGuildColor(guildName, data.prefix, guildColors, fallbackColor);
      const clusterCentroid: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];

      const boxWidth = maxX - minX;
      const estimatedFontSize = Math.max(12, Math.min(64, boxWidth / 4));
      const prefixLength = data.prefix?.length || 3;
      const estimatedLabelWidth = prefixLength * estimatedFontSize * 0.7 + 16;
      const estimatedLabelHeight = estimatedFontSize * 1.4 + 8;

      preClusters.push({
        guildName,
        guildPrefix: data.prefix,
        guildColor,
        territoryNames: clusterNames,
        rectangles,
        boundingBox: { minX, maxX, minY, maxY },
        centroid: clusterCentroid,
        totalArea,
        estimatedLabelWidth,
        estimatedLabelHeight,
      });
    }
  }

  // Phase 2: Sort by area (smallest first) so smaller polygons are drawn on top
  preClusters.sort((a, b) => a.totalArea - b.totalArea);

  // Phase 3: Pre-compute all rectangles with cluster indices (O(N) optimization)
  const allRectsWithIndex: { rect: { minX: number; maxX: number; minY: number; maxY: number }; clusterIdx: number }[] = [];
  for (let idx = 0; idx < preClusters.length; idx++) {
    for (const rect of preClusters[idx].rectangles) {
      allRectsWithIndex.push({ rect, clusterIdx: idx });
    }
  }

  // Phase 4: Process each cluster with exclusions from other clusters
  const result: TerritoryCluster[] = [];

  // Helper function to check if a label bounding box overlaps with any excluded rectangle
  const labelOverlapsExcluded = (
    labelX: number,
    labelY: number,
    labelWidth: number,
    labelHeight: number,
    excludedRects: { minX: number; maxX: number; minY: number; maxY: number }[]
  ): boolean => {
    const halfW = labelWidth / 2;
    const halfH = labelHeight / 2;
    const labelMinX = labelX - halfW;
    const labelMaxX = labelX + halfW;
    const labelMinY = labelY - halfH;
    const labelMaxY = labelY + halfH;

    for (const rect of excludedRects) {
      // Check if rectangles overlap
      if (labelMinX < rect.maxX && labelMaxX > rect.minX &&
          labelMinY < rect.maxY && labelMaxY > rect.minY) {
        return true;
      }
    }
    return false;
  };

  // Helper function to check if a point is inside any excluded rectangle
  const pointInExcluded = (
    x: number,
    y: number,
    excludedRects: { minX: number; maxX: number; minY: number; maxY: number }[]
  ): boolean => {
    for (const rect of excludedRects) {
      if (x >= rect.minX && x <= rect.maxX && y >= rect.minY && y <= rect.maxY) {
        return true;
      }
    }
    return false;
  };

  // Helper function to find the best territory center that doesn't overlap with excluded rectangles
  const findBestTerritoryCenter = (
    targetX: number,
    targetY: number,
    territoryNames: string[],
    territories: Record<string, Territory>,
    excludedRects: { minX: number; maxX: number; minY: number; maxY: number }[]
  ): { center: [number, number]; rect: { minX: number; maxX: number; minY: number; maxY: number } } => {
    let bestNonOverlapping: { center: [number, number]; rect: { minX: number; maxX: number; minY: number; maxY: number }; dist: number } | null = null;
    let closestAny: { center: [number, number]; rect: { minX: number; maxX: number; minY: number; maxY: number }; dist: number } | null = null;

    for (const name of territoryNames) {
      const territory = territories[name];
      const rect = getTerritoryRect(territory);
      const centerX = (rect.minX + rect.maxX) / 2;
      const centerY = (rect.minY + rect.maxY) / 2;
      const dist = Math.sqrt(Math.pow(centerX - targetX, 2) + Math.pow(centerY - targetY, 2));

      const isOverlapping = pointInExcluded(centerX, centerY, excludedRects);

      if (!isOverlapping) {
        if (!bestNonOverlapping || dist < bestNonOverlapping.dist) {
          bestNonOverlapping = { center: [centerX, centerY], rect, dist };
        }
      }

      if (!closestAny || dist < closestAny.dist) {
        closestAny = { center: [centerX, centerY], rect, dist };
      }
    }

    // Prefer non-overlapping, fall back to closest if all overlap
    const best = bestNonOverlapping || closestAny;
    return best ? { center: best.center, rect: best.rect } : { center: [targetX, targetY], rect: { minX: targetX - 50, maxX: targetX + 50, minY: targetY - 25, maxY: targetY + 25 } };
  };

  for (let clusterIdx = 0; clusterIdx < preClusters.length; clusterIdx++) {
    const preCluster = preClusters[clusterIdx];

    const excludedRectangles = allRectsWithIndex
      .filter(r => r.clusterIdx !== clusterIdx)
      .map(r => r.rect);

    const { path: unionPath, labelPosition, labelMaxWidth, labelMaxHeight } = computeRectilinearUnionPath(
      preCluster.rectangles,
      preCluster.centroid,
      preCluster.estimatedLabelWidth,
      preCluster.estimatedLabelHeight,
      excludedRectangles
    );

    // Check if the computed label position overlaps with any other polygon
    let finalLabelPosition = labelPosition;
    let finalLabelMaxWidth = labelMaxWidth;
    let finalLabelMaxHeight = labelMaxHeight;

    if (labelOverlapsExcluded(labelPosition[0], labelPosition[1], labelMaxWidth, labelMaxHeight, excludedRectangles)) {
      // Find the best territory in this cluster to center the label
      const { center: fallbackCenter, rect: fallbackRect } = findBestTerritoryCenter(
        labelPosition[0],
        labelPosition[1],
        preCluster.territoryNames,
        territories,
        excludedRectangles
      );

      finalLabelPosition = fallbackCenter;
      finalLabelMaxWidth = fallbackRect.maxX - fallbackRect.minX;
      finalLabelMaxHeight = fallbackRect.maxY - fallbackRect.minY;
    }

    result.push({
      guildName: preCluster.guildName,
      guildPrefix: preCluster.guildPrefix,
      guildColor: preCluster.guildColor,
      territoryNames: preCluster.territoryNames,
      rectangles: preCluster.rectangles,
      boundingBox: preCluster.boundingBox,
      centroid: preCluster.centroid,
      labelPosition: finalLabelPosition,
      labelMaxWidth: finalLabelMaxWidth,
      labelMaxHeight: finalLabelMaxHeight,
      unionPath,
    });
  }

  return result;
}
