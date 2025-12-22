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
    return clusters.map((cluster, index) => {
      const { boundingBox, labelPosition, labelMaxWidth, labelMaxHeight, guildPrefix, guildColor, unionPath, guildName } = cluster;

      // Calculate font size to fit within the inscribed rectangle
      const boxWidth = boundingBox.maxX - boundingBox.minX;
      let fontSize = Math.max(12, Math.min(64, boxWidth / 4) / zoom);

      // Constrain text to fit within the available label area
      if (guildPrefix && labelMaxWidth > 0 && labelMaxHeight > 0) {
        const chars = guildPrefix.length;
        const charWidthFactor = 0.65;
        const heightFactor = 1.2;
        const padding = 8;
        const availableWidth = labelMaxWidth - padding * 2;
        const availableHeight = labelMaxHeight - padding * 2;

        const maxFontByWidth = availableWidth / (chars * charWidthFactor);
        const maxFontByHeight = availableHeight / heightFactor;
        const maxFontSize = Math.min(maxFontByWidth, maxFontByHeight);
        fontSize = Math.min(fontSize, maxFontSize);
      }

      fontSize = Math.max(8, fontSize);
      const strokeWidth = Math.min(fontSize * 0.15, 4);

      return {
        key: `cluster-${guildName}-${index}`,
        guildName,
        guildColor,
        guildPrefix,
        unionPath,
        labelPosition,
        fontSize,
        strokeWidth,
      };
    });
  }, [clusters, zoom]);

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
