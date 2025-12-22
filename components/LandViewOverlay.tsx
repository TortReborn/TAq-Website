"use client";

import React, { useMemo, useEffect, useState } from "react";
import { Territory } from "@/lib/utils";
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
}

const LandViewOverlay = React.memo(function LandViewOverlay({
  territories,
  verboseData: propVerboseData,
  guildColors,
  scale = 1,
  precomputedClusters,
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

  // Use precomputed clusters if provided, otherwise compute them
  const clusters = useMemo(() => {
    // If precomputed clusters are provided, use them directly
    if (precomputedClusters && precomputedClusters.length > 0) {
      return precomputedClusters;
    }

    // Fall back to computing clusters if no precomputed data
    return computeLandViewClusters(territories, verboseData, guildColors);
  }, [precomputedClusters, territories, verboseData, guildColors]);

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
