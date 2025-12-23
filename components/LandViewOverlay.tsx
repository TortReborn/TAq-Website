"use client";

import React, { useMemo, useEffect, useState, useCallback, useRef } from "react";
import { Territory, coordToPixel } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";
import {
  TerritoryCluster,
  STROKE_WIDTH,
  computeLandViewClusters,
} from "@/lib/territoryComputation";

interface LandViewOverlayProps {
  territories: Record<string, Territory>;
  verboseData: Record<string, TerritoryVerboseData> | null;
  guildColors: Record<string, string>;
  scale?: number;
  precomputedClusters?: TerritoryCluster[] | null;
  onHoverGuild?: (guildName: string | null, landArea: number) => void;
}

const LandViewOverlay = React.memo(function LandViewOverlay({
  territories,
  verboseData: propVerboseData,
  guildColors,
  scale = 1,
  precomputedClusters,
  onHoverGuild,
}: LandViewOverlayProps) {
  // Fallback: load verbose data directly if not provided
  const [localVerboseData, setLocalVerboseData] = useState<Record<string, TerritoryVerboseData> | null>(null);

  // Refs for DOM-based hover highlighting (no re-renders)
  const svgRef = useRef<SVGSVGElement>(null);
  const hoveredGuildRef = useRef<string | null>(null);
  const guildLandAreasRef = useRef<Record<string, number>>({});

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

  // Use precomputed clusters if provided, otherwise compute them
  const clusters = useMemo(() => {
    // If precomputed clusters are provided, use them directly
    if (precomputedClusters && precomputedClusters.length > 0) {
      return precomputedClusters;
    }

    // Fall back to computing clusters if no precomputed data
    return computeLandViewClusters(territories, verboseData, guildColors);
  }, [precomputedClusters, territories, verboseData, guildColors]);

  // Calculate total land area per guild and store in ref (doesn't trigger re-renders)
  useEffect(() => {
    const areas: Record<string, number> = {};

    Object.values(territories).forEach(territory => {
      if (territory.guild && territory.guild.name && territory.guild.name !== "Unclaimed") {
        const guildName = territory.guild.name;
        if (!areas[guildName]) {
          areas[guildName] = 0;
        }
        if (territory.location) {
          const start = coordToPixel(territory.location.start);
          const end = coordToPixel(territory.location.end);
          const width = Math.abs(end[0] - start[0]);
          const height = Math.abs(end[1] - start[1]);
          areas[guildName] += width * height;
        }
      }
    });

    guildLandAreasRef.current = areas;
  }, [territories]);

  // Highlight all polygons of a guild using DOM manipulation (no React re-renders)
  const highlightGuild = useCallback((guildName: string | null) => {
    const svg = svgRef.current;
    if (!svg) return;

    // Remove highlight from previously hovered guild
    if (hoveredGuildRef.current) {
      const prevPolygons = svg.querySelectorAll(`[data-guild="${CSS.escape(hoveredGuildRef.current)}"]`);
      prevPolygons.forEach(polygon => {
        polygon.classList.remove('guild-highlighted');
      });
    }

    // Add highlight to new guild
    if (guildName) {
      const newPolygons = svg.querySelectorAll(`[data-guild="${CSS.escape(guildName)}"]`);
      newPolygons.forEach(polygon => {
        polygon.classList.add('guild-highlighted');
      });
    }

    hoveredGuildRef.current = guildName;

    // Notify parent for tooltip
    if (onHoverGuild) {
      const area = guildName ? (guildLandAreasRef.current[guildName] || 0) : 0;
      onHoverGuild(guildName, area);
    }
  }, [onHoverGuild]);

  const handleMouseEnter = useCallback((guildName: string) => {
    highlightGuild(guildName);
  }, [highlightGuild]);

  const handleMouseLeave = useCallback(() => {
    highlightGuild(null);
  }, [highlightGuild]);

  const zoom = scale;

  // Pre-compute rendered elements to avoid recalculation
  const renderedClusters = useMemo(() => {
    const charWidthFactor = 0.65;
    const heightFactor = 1.2;
    const padding = 8;

    // Helper function to check if a label bounding box overlaps with any rectangle
    const labelOverlapsRects = (
      labelX: number,
      labelY: number,
      labelWidth: number,
      labelHeight: number,
      rects: { minX: number; maxX: number; minY: number; maxY: number }[]
    ): boolean => {
      const halfW = labelWidth / 2;
      const halfH = labelHeight / 2;
      const labelMinX = labelX - halfW;
      const labelMaxX = labelX + halfW;
      const labelMinY = labelY - halfH;
      const labelMaxY = labelY + halfH;

      for (const rect of rects) {
        if (labelMinX < rect.maxX && labelMaxX > rect.minX &&
            labelMinY < rect.maxY && labelMaxY > rect.minY) {
          return true;
        }
      }
      return false;
    };

    // Helper function to get the center of a territory by name
    const getTerritoryCenter = (name: string): { x: number; y: number; width: number; height: number } | null => {
      const territory = territories[name];
      if (!territory?.location) return null;
      const start = coordToPixel(territory.location.start);
      const end = coordToPixel(territory.location.end);
      const minX = Math.min(start[0], end[0]);
      const maxX = Math.max(start[0], end[0]);
      const minY = Math.min(start[1], end[1]);
      const maxY = Math.max(start[1], end[1]);
      return {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY
      };
    };

    // First pass: calculate font sizes and actual label dimensions
    const clustersWithFonts = clusters.map((cluster, index) => {
      const { boundingBox, labelPosition, labelMaxWidth, labelMaxHeight, guildPrefix, guildColor, unionPath, guildName, rectangles, territoryNames } = cluster;

      // Calculate font size to fit within the inscribed rectangle
      const boxWidth = boundingBox.maxX - boundingBox.minX;
      let fontSize = Math.max(12, Math.min(64, boxWidth / 4) / zoom);

      // Constrain text to fit within the available label area
      if (guildPrefix && labelMaxWidth > 0 && labelMaxHeight > 0) {
        const chars = guildPrefix.length;
        const availableWidth = labelMaxWidth - padding * 2;
        const availableHeight = labelMaxHeight - padding * 2;

        const maxFontByWidth = availableWidth / (chars * charWidthFactor);
        const maxFontByHeight = availableHeight / heightFactor;
        const maxFontSize = Math.min(maxFontByWidth, maxFontByHeight);
        fontSize = Math.min(fontSize, maxFontSize);
      }

      fontSize = Math.max(8, fontSize);

      // Calculate actual label dimensions based on computed font size
      const chars = guildPrefix?.length || 3;
      const actualLabelWidth = chars * fontSize * charWidthFactor + padding * 2;
      const actualLabelHeight = fontSize * heightFactor + padding * 2;

      return {
        index,
        guildName,
        guildColor,
        guildPrefix,
        unionPath,
        labelPosition,
        fontSize,
        actualLabelWidth,
        actualLabelHeight,
        rectangles,
        territoryNames,
      };
    });

    // Second pass: check for overlaps and adjust label positions
    return clustersWithFonts.map((cluster) => {
      const { index, guildName, guildColor, guildPrefix, unionPath, labelPosition, fontSize, actualLabelWidth, actualLabelHeight, territoryNames } = cluster;

      // Collect all rectangles from OTHER clusters (not this one)
      const excludedRects: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
      for (const otherCluster of clustersWithFonts) {
        if (otherCluster.index !== index) {
          excludedRects.push(...otherCluster.rectangles);
        }
      }

      let finalLabelPosition = labelPosition;

      // Check if the label overlaps with any other cluster's territory
      if (labelOverlapsRects(labelPosition[0], labelPosition[1], actualLabelWidth, actualLabelHeight, excludedRects)) {
        // Try to find a territory in this cluster where the label doesn't overlap
        let bestFallback: { x: number; y: number; dist: number } | null = null;

        for (const terrName of territoryNames) {
          const terrCenter = getTerritoryCenter(terrName);
          if (!terrCenter) continue;

          // Check if this territory center would cause an overlap
          if (!labelOverlapsRects(terrCenter.x, terrCenter.y, actualLabelWidth, actualLabelHeight, excludedRects)) {
            const dist = Math.sqrt(
              Math.pow(terrCenter.x - labelPosition[0], 2) +
              Math.pow(terrCenter.y - labelPosition[1], 2)
            );
            if (!bestFallback || dist < bestFallback.dist) {
              bestFallback = { x: terrCenter.x, y: terrCenter.y, dist };
            }
          }
        }

        if (bestFallback) {
          finalLabelPosition = [bestFallback.x, bestFallback.y];
        }
      }

      const strokeWidth = Math.min(fontSize * 0.15, 4);

      return {
        key: `cluster-${guildName}-${index}`,
        guildName,
        guildColor,
        guildPrefix,
        unionPath,
        labelPosition: finalLabelPosition,
        fontSize,
        strokeWidth,
      };
    });
  }, [clusters, zoom, territories]);

  return (
    <>
      <style>{`
        .land-polygon {
          pointer-events: auto;
          cursor: pointer;
          transition: stroke 0.15s ease, stroke-width 0.15s ease;
        }
        .land-polygon.guild-highlighted {
          stroke: #FFD700 !important;
          stroke-width: ${STROKE_WIDTH + 2}px !important;
        }
      `}</style>
      <svg
        ref={svgRef}
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
        {renderedClusters.map((cluster) => (
          <g key={cluster.key}>
            <path
              className="land-polygon"
              data-guild={cluster.guildName}
              d={cluster.unionPath}
              fill={cluster.guildColor + "40"}
              stroke={cluster.guildColor}
              strokeWidth={STROKE_WIDTH}
              strokeLinejoin="miter"
              onMouseEnter={() => handleMouseEnter(cluster.guildName)}
              onMouseLeave={handleMouseLeave}
            />
            <text
              x={cluster.labelPosition[0]}
              y={cluster.labelPosition[1]}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontSize: `${cluster.fontSize}px`,
                fontWeight: "bold",
                fontFamily: "Arial Black, Arial, sans-serif",
                letterSpacing: "2px",
                fill: "#ffffff",
                stroke: "#000000",
                strokeWidth: `${cluster.strokeWidth}px`,
                paintOrder: "stroke fill",
                pointerEvents: "none",
              }}
            >
              {cluster.guildPrefix}
            </text>
          </g>
        ))}
      </svg>
    </>
  );
});

export default LandViewOverlay;
