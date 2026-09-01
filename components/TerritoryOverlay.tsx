"use client";

import React, { useMemo, useSyncExternalStore } from "react";
import { Territory, coordToPixel } from "@/lib/utils";
import { TerritoryVerboseData } from "@/lib/connection-calculator";

interface TerritoryOverlayProps {
  name: string;
  territory: Territory;
  scale?: number;
  isDragging?: boolean;
  onClick?: (name: string, territory: Territory) => void;
  onMouseEnter?: (name: string, territory: Territory) => void;
  onMouseLeave?: () => void;
  guildColors: Record<string, string>;
  showTimeOutlines?: boolean;
  showResourceOutlines?: boolean;
  showGuildNames?: boolean;
  verboseData?: TerritoryVerboseData | null;
  opaqueFill?: boolean;
  fallbackColor?: string;
}

// Stroke width for territory outlines
const STROKE_WIDTH = 4;
const STROKE_INSET = STROKE_WIDTH / 2; // Inset to keep stroke inside territory bounds

// Resource colors
const RESOURCE_COLORS: Record<string, string> = {
  emeralds: "#4CAF50", // Green
  ore: "#B0BEC5",      // Gray/white
  wood: "#8D6E63",     // Brown
  crops: "#FFEB3B",    // Yellow
  fish: "#2196F3",     // Blue
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

function isValidHexColor(color: string | undefined): boolean {
  return !!color && HEX_COLOR_RE.test(color);
}

// ---------------------------------------------------------------------------
// Shared 1 Hz clock. All overlays subscribe to a single interval; each
// component re-renders only when its derived time snapshot string changes
// (useSyncExternalStore compares snapshots with Object.is).
// ---------------------------------------------------------------------------
const clockListeners = new Set<() => void>();
let clockNow = Date.now();
let clockInterval: ReturnType<typeof setInterval> | null = null;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockInterval) {
    clockNow = Date.now();
    clockInterval = setInterval(() => {
      clockNow = Date.now();
      clockListeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  };
}

// Time-outline style buckets (dashed outline during the first 10 minutes held)
const OUTLINE_STYLES: Record<string, { stroke: string; strokeDasharray: string; animate: boolean }> = {
  red: { stroke: "#ff0000", strokeDasharray: "12 6", animate: false },
  orange: { stroke: "#ff8c00", strokeDasharray: "12 6", animate: false },
  yellow: { stroke: "#ffff00", strokeDasharray: "12 6", animate: false },
  lime: { stroke: "#32cd32", strokeDasharray: "12 6", animate: false },
  flash: { stroke: "#ff0000", strokeDasharray: "12 6", animate: true },
};

function outlineBucket(diffSeconds: number): string {
  if (diffSeconds < 60) return "red";
  if (diffSeconds < 300) return "orange";
  if (diffSeconds < 540) return "yellow";
  if (diffSeconds < 585) return "lime";
  if (diffSeconds < 600) return "flash";
  return "";
}

// Format held duration; pure function of (now, acquired)
function formatHeldDuration(acquired: string, now: number): { text: string; color: string } {
  const acquiredDate = new Date(acquired);
  let diff = Math.floor((now - acquiredDate.getTime()) / 1000); // seconds
  if (isNaN(diff) || diff < 0) return { text: "", color: "" };
  const days = Math.floor(diff / 86400);
  diff -= days * 86400;
  const hours = Math.floor(diff / 3600);
  diff -= hours * 3600;
  const minutes = Math.floor(diff / 60);
  const seconds = diff - minutes * 60;
  let text = "";
  if (days > 0) {
    text = `${days}d`;
    if (hours > 0) text += `${hours}h`;
  } else if (hours > 0) {
    text = `${hours}h`;
    if (minutes > 0) text += `${minutes}m`;
  } else if (minutes > 0) {
    text = `${minutes}m`;
    if (seconds > 0) text += `${seconds}s`;
  } else {
    text = `${seconds}s`;
  }
  // Color logic
  let color = "#b71c1c"; // dark red
  if (days >= 5) color = "#43a047"; // green
  else if (days >= 1) color = "#fbc02d"; // yellow
  else if (hours >= 1) color = "#fb8c00"; // orange
  else if (minutes >= 10) color = "#e57373"; // light red
  return { text, color };
}

// Derived per-territory time state, encoded as a string so unchanged values
// skip re-rendering. Format: "outlineBucket|timerText|timerColor".
function computeTimeSnapshot(
  acquired: string | undefined,
  needOutline: boolean,
  needTimer: boolean,
): string {
  if (!acquired || (!needOutline && !needTimer)) return "||";
  let bucket = "";
  if (needOutline) {
    const diffSeconds = Math.floor((clockNow - new Date(acquired).getTime()) / 1000);
    if (!isNaN(diffSeconds) && diffSeconds >= 0) bucket = outlineBucket(diffSeconds);
  }
  let timerText = "";
  let timerColor = "";
  if (needTimer) {
    const t = formatHeldDuration(acquired, clockNow);
    timerText = t.text;
    timerColor = t.color;
  }
  return `${bucket}|${timerText}|${timerColor}`;
}

const EMPTY_SNAPSHOT = "||";
const getServerTimeSnapshot = () => EMPTY_SNAPSHOT;

// ---------------------------------------------------------------------------
// Closed-form font fitting (replaces the old decrement-until-fit loops).
// Text stroke is min(0.25*f, strokeCap); width ≈ charW*f + stroke;
// height ≈ f + 2*stroke. Both are monotonic in f, so the largest fitting f
// has a closed form split at f = 4*strokeCap (where the stroke saturates).
// ---------------------------------------------------------------------------
function maxFontForConstraints(
  maxW: number | null,
  maxH: number,
  strokeCap: number,
  charW: number,
): number {
  // Regime A: f <= 4*strokeCap, stroke = 0.25*f
  let fA = maxH / 1.5;
  if (maxW !== null) fA = Math.min(fA, maxW / (charW + 0.25));
  fA = Math.min(fA, 4 * strokeCap);
  // Regime B: f > 4*strokeCap, stroke = strokeCap
  let fB = maxH - 2 * strokeCap;
  if (maxW !== null) fB = Math.min(fB, (maxW - strokeCap) / charW);
  return Math.max(fA, fB > 4 * strokeCap ? fB : 0);
}

function TerritoryOverlay({
  name,
  territory,
  scale = 1,
  isDragging = false,
  onClick,
  onMouseEnter,
  onMouseLeave,
  guildColors,
  showTimeOutlines = true,
  showResourceOutlines = false,
  showGuildNames = true,
  verboseData,
  opaqueFill = false,
  fallbackColor = '#FFFFFF',
}: TerritoryOverlayProps) {
  // Use scale prop for zoom, define at top
  const zoom = scale;
  // Local drag detection
  const dragState = React.useRef({ down: false, moved: false, startX: 0, startY: 0 });

  // Get guild color from props, with fallback to white (gray for unclaimed)
  const guildColor = useMemo(() => {
    const guildName = territory.guild.name;
    const guildPrefix = territory.guild.prefix;

    if (!guildName || guildName === 'Unclaimed') {
      return '#808080';
    }

    // Try prefix first, then guild name, then lowercase versions
    // Only use color if it's a valid hex color
    const candidates = [
      guildColors[guildPrefix],
      guildColors[guildName],
      guildColors[guildPrefix?.toLowerCase()],
      guildColors[guildName.toLowerCase()]
    ];

    for (const color of candidates) {
      if (isValidHexColor(color)) {
        return color;
      }
    }

    return fallbackColor;
  }, [territory.guild.name, territory.guild.prefix, guildColors, fallbackColor]);

  // Calculate active resources for this territory
  const activeResources = useMemo(() => {
    if (!verboseData?.resources) return [];

    const resources: { key: string; color: string }[] = [];
    const res = verboseData.resources;

    // Only show emeralds if > 9000
    const emeraldAmount = parseInt(res.emeralds || '0', 10);
    if (emeraldAmount > 9000) {
      resources.push({ key: 'emeralds', color: RESOURCE_COLORS.emeralds });
    }

    // Other resources: show if > 0
    if (res.ore && parseInt(res.ore, 10) > 0) {
      resources.push({ key: 'ore', color: RESOURCE_COLORS.ore });
    }
    if (res.wood && parseInt(res.wood, 10) > 0) {
      resources.push({ key: 'wood', color: RESOURCE_COLORS.wood });
    }
    if (res.crops && parseInt(res.crops, 10) > 0) {
      resources.push({ key: 'crops', color: RESOURCE_COLORS.crops });
    }
    if (res.fish && parseInt(res.fish, 10) > 0) {
      resources.push({ key: 'fish', color: RESOURCE_COLORS.fish });
    }

    return resources;
  }, [verboseData]);

  // Check if this is a double production territory (7200+ total non-emerald resources)
  const isDoubleProduction = useMemo(() => {
    if (!verboseData?.resources) return false;
    const res = verboseData.resources;
    const ore = parseInt(res.ore || '0', 10);
    const wood = parseInt(res.wood || '0', 10);
    const crops = parseInt(res.crops || '0', 10);
    const fish = parseInt(res.fish || '0', 10);
    const total = ore + wood + crops + fish;
    return total >= 7200;
  }, [verboseData]);

  const startX = territory.location.start[0];
  const startY = territory.location.start[1];
  const endX = territory.location.end[0];
  const endY = territory.location.end[1];

  // Corner pixel geometry — keyed on primitive coordinates so the memo holds
  // across renders even when the territory object identity changes.
  const geometry = useMemo(() => {
    const start = coordToPixel([startX, startY]);
    const end = coordToPixel([endX, endY]);
    // Rectangle: topLeft, topRight, bottomRight, bottomLeft
    // Inset corners so stroke stays within territory bounds (doesn't overlap neighbors)
    const topLeft = [Math.min(start[0], end[0]) + STROKE_INSET, Math.min(start[1], end[1]) + STROKE_INSET];
    const topRight = [Math.max(start[0], end[0]) - STROKE_INSET, Math.min(start[1], end[1]) + STROKE_INSET];
    const bottomRight = [Math.max(start[0], end[0]) - STROKE_INSET, Math.max(start[1], end[1]) - STROKE_INSET];
    const bottomLeft = [Math.min(start[0], end[0]) + STROKE_INSET, Math.max(start[1], end[1]) - STROKE_INSET];
    const points = [topLeft, topRight, bottomRight, bottomLeft].map(p => p.join(",")).join(" ");
    return { topLeft, topRight, bottomRight, bottomLeft, points };
  }, [startX, startY, endX, endY]);

  const { topLeft, topRight, bottomRight, points } = geometry;

  // Calculate resource fill sections (quadrants/corners)
  const resourceFillData = useMemo(() => {
    if (!showResourceOutlines || activeResources.length === 0) return null;

    const { topLeft, bottomRight } = geometry;
    const minX = topLeft[0];
    const maxX = bottomRight[0];
    const minY = topLeft[1];
    const maxY = bottomRight[1];

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const sections: { color: string; points: string }[] = [];

    // For single resource, fill the whole territory
    if (activeResources.length === 1) {
      const points = `${minX},${minY} ${maxX},${minY} ${maxX},${maxY} ${minX},${maxY}`;
      return [{ color: activeResources[0].color, points }];
    }

    // For 2 resources: split into left and right halves
    if (activeResources.length === 2) {
      // Left half
      sections.push({
        color: activeResources[0].color,
        points: `${minX},${minY} ${centerX},${minY} ${centerX},${maxY} ${minX},${maxY}`,
      });
      // Right half
      sections.push({
        color: activeResources[1].color,
        points: `${centerX},${minY} ${maxX},${minY} ${maxX},${maxY} ${centerX},${maxY}`,
      });
      return sections;
    }

    // For 3 resources: top-left, top-right, bottom (full width)
    if (activeResources.length === 3) {
      // Top-left quadrant
      sections.push({
        color: activeResources[0].color,
        points: `${minX},${minY} ${centerX},${minY} ${centerX},${centerY} ${minX},${centerY}`,
      });
      // Top-right quadrant
      sections.push({
        color: activeResources[1].color,
        points: `${centerX},${minY} ${maxX},${minY} ${maxX},${centerY} ${centerX},${centerY}`,
      });
      // Bottom half (full width)
      sections.push({
        color: activeResources[2].color,
        points: `${minX},${centerY} ${maxX},${centerY} ${maxX},${maxY} ${minX},${maxY}`,
      });
      return sections;
    }

    // For 4+ resources: four quadrants (corners)
    // Top-left quadrant
    sections.push({
      color: activeResources[0].color,
      points: `${minX},${minY} ${centerX},${minY} ${centerX},${centerY} ${minX},${centerY}`,
    });
    // Top-right quadrant
    sections.push({
      color: activeResources[1].color,
      points: `${centerX},${minY} ${maxX},${minY} ${maxX},${centerY} ${centerX},${centerY}`,
    });
    // Bottom-right quadrant
    sections.push({
      color: activeResources[2].color,
      points: `${centerX},${centerY} ${maxX},${centerY} ${maxX},${maxY} ${centerX},${maxY}`,
    });
    // Bottom-left quadrant
    sections.push({
      color: activeResources[3].color,
      points: `${minX},${centerY} ${centerX},${centerY} ${centerX},${maxY} ${minX},${maxY}`,
    });

    return sections;
  }, [showResourceOutlines, activeResources, geometry]);

  // Shared-clock time state: outline bucket + held-duration text/color.
  // Only re-renders this overlay when the derived snapshot string changes.
  const needTimer = showGuildNames && !!territory.guild.prefix && zoom >= 0.3 && !!territory.acquired;
  const needOutline = showTimeOutlines && !!territory.acquired;
  const acquired = territory.acquired;
  const timeSnapshot = useSyncExternalStore(
    subscribeClock,
    () => computeTimeSnapshot(acquired, needOutline, needTimer),
    getServerTimeSnapshot,
  );
  const firstSep = timeSnapshot.indexOf("|");
  const lastSep = timeSnapshot.lastIndexOf("|");
  const timeOutline = OUTLINE_STYLES[timeSnapshot.slice(0, firstSep)] ?? null;
  const timerText = timeSnapshot.slice(firstSep + 1, lastSep);
  const timerColor = timeSnapshot.slice(lastSep + 1);

  // SVG overlay positioned absolutely over the map
  // Dynamically size the guild tag so it fits inside the territory box
  const maxFontSize = 64;
  const margin = 12;
  const boxWidth = Math.abs(bottomRight[0] - topLeft[0]) - margin * 2;
  const boxHeight = Math.abs(bottomRight[1] - topLeft[1]) - margin * 2;
  // Font size scales down as zoom increases
  // At zoom 1, use maxFontSize; at zoom 2, use maxFontSize/2, etc. Clamp to min 12
  const startFontSize = Math.max(12, maxFontSize / zoom);
  const prefixStrokeCap = Math.max(2, Math.min(8 / zoom, 8 / 0.45));
  let fontSize = startFontSize;
  // Allow text and outline to use up to 98% of box width (1% gap), but keep height at 90%
  if (territory.guild.prefix) {
    const chars = territory.guild.prefix.length;
    // widthFactor 1.2 accounts for bold, outline, and letter spacing
    const fit = maxFontForConstraints(boxWidth * 0.98, boxHeight * 0.9, prefixStrokeCap, chars * 1.2);
    fontSize = Math.min(startFontSize, Math.max(12, fit));
  }

  return (
    <svg
      data-territory-name={name}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 100,
      }}
      shapeRendering="geometricPrecision"
      textRendering="geometricPrecision"
    >
      <polygon
        points={points}
        fill={guildColor + (opaqueFill ? "FF" : "40")}
        stroke={guildColor}
        strokeWidth={STROKE_WIDTH}
        style={{ pointerEvents: "auto", cursor: isDragging ? "grabbing" : "grab" }}
        onPointerDown={e => {
          dragState.current.down = true;
          dragState.current.moved = false;
          dragState.current.startX = e.clientX;
          dragState.current.startY = e.clientY;
        }}
        onPointerMove={e => {
          if (dragState.current.down) {
            const dx = e.clientX - dragState.current.startX;
            const dy = e.clientY - dragState.current.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
              dragState.current.moved = true;
            }
          }
        }}
        onPointerUp={() => {
          dragState.current.down = false;
        }}
        onClick={() => {
          // Only trigger onClick if not dragging and if pointer didn't move
          if (isDragging || dragState.current.moved) return;
          onClick?.(name, territory);
        }}
        onMouseEnter={() => onMouseEnter?.(name, territory)}
        onMouseLeave={onMouseLeave}
      />
      {/* Time-based dashed outline */}
      {timeOutline && (
        <polygon
          points={points}
          fill="none"
          stroke={timeOutline.animate ? undefined : timeOutline.stroke}
          strokeWidth={STROKE_WIDTH}
          strokeDasharray={timeOutline.strokeDasharray}
          style={{ pointerEvents: "none" }}
        >
          {timeOutline.animate && (
            <animate
              attributeName="stroke"
              values="#ff0000;#ffffff;#ff0000"
              dur="0.5s"
              repeatCount="indefinite"
            />
          )}
        </polygon>
      )}
      {/* Resource fill sections */}
      {resourceFillData && resourceFillData.map((section, index) => (
        <polygon
          key={`resource-${index}`}
          points={section.points}
          fill={section.color + "90"}
          stroke="none"
          style={{ pointerEvents: "none" }}
        />
      ))}
      {/* Guild tag centered in territory, bold white blocky font with black outline */}
      {showGuildNames && territory.guild.prefix && (
        <>
          {/* Double production icon - double up arrows shown in resource view for territories with 7200+ total non-emerald resources */}
          {showResourceOutlines && isDoubleProduction && (() => {
            const iconSize = Math.max(16, fontSize * 0.5);
            const iconX = topLeft[0] + iconSize / 2 + 6;
            const iconY = topLeft[1] + iconSize / 2 + 6;
            const strokeW = Math.max(2, iconSize * 0.15);
            const arrowW = iconSize * 0.7;
            const arrowH = iconSize * 0.4;
            const gap = iconSize * 0.15;
            // Two chevrons/arrows pointing up
            const arrow1Y = iconY - gap / 2 - arrowH / 2;
            const arrow2Y = iconY + gap / 2 + arrowH / 2;
            const arrowPath = `M${iconX - arrowW / 2},${arrow1Y + arrowH / 2} L${iconX},${arrow1Y - arrowH / 2} L${iconX + arrowW / 2},${arrow1Y + arrowH / 2} M${iconX - arrowW / 2},${arrow2Y + arrowH / 2} L${iconX},${arrow2Y - arrowH / 2} L${iconX + arrowW / 2},${arrow2Y + arrowH / 2}`;
            return (
              <path
                d={arrowPath}
                fill="none"
                stroke="#fff"
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ pointerEvents: 'none', filter: 'drop-shadow(1px 1px 1px #000) drop-shadow(-1px -1px 1px #000)' }}
              />
            );
          })()}
          <text
            strokeLinejoin="round"
            x={(topLeft[0] + bottomRight[0]) / 2}
            y={(topLeft[1] + bottomRight[1]) / 2}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontSize={fontSize}
            fontWeight="bold"
            fill="#fff"
            pointerEvents="none"
            stroke="#000"
            strokeWidth={Math.min(fontSize * 0.25, prefixStrokeCap)}
            style={{
              fontFamily: 'Arial Black, Arial, sans-serif',
              letterSpacing: '2px',
              paintOrder: 'stroke fill',
              textRendering: 'geometricPrecision',
              shapeRendering: 'geometricPrecision',
            }}
          >
            {territory.guild.prefix}
          </text>
          {/* Held duration below prefix if zoom >= 0.3 (strictly, so 0.3 and above only) */}
          {needTimer && timerText && (() => {
            const timerStrokeCap = Math.max(1, Math.min(5 / zoom, 5 / 0.45));
            // For timer font size, use a more balanced approach:
            // minimum of 90% of guild size, or a size based on territory dimensions
            const baseSizeFromGuild = fontSize * 0.9;
            const baseSizeFromTerritory = Math.min(
              (boxWidth * 0.98) / (timerText.length * 0.65), // Width-based sizing
              boxHeight * 0.25 // Height-based sizing (use 25% of available height)
            );
            const startTimerSize = Math.max(8, Math.min(baseSizeFromGuild, baseSizeFromTerritory));

            const maxAllowedHeight = boxHeight * 0.9;
            const centerY = (topLeft[1] + bottomRight[1]) / 2;
            const boxBottom = bottomRight[1] - margin - boxHeight * 0.05;
            let timerY = centerY + fontSize + 8;

            // Timer is only constrained by height and bottom position, not width —
            // this prevents tiny timer text in wide territories.
            const heightCap = Math.min(maxAllowedHeight, 2 * (boxBottom - timerY));
            const fit = maxFontForConstraints(null, heightCap, timerStrokeCap, 0);
            let timerFontSize = Math.min(startTimerSize, Math.max(8, fit));
            let prefixFontSize = fontSize;

            // Balance check: if there's a large disparity between prefix and timer sizes, balance them
            const sizeRatio = prefixFontSize / timerFontSize;
            if (sizeRatio > 2.5) { // If prefix is more than 2.5x larger than timer
              const baseSize = Math.max(prefixFontSize, timerFontSize);
              const balancedPrefixSize = baseSize * 0.7; // 70% of the larger size
              const balancedTimerSize = baseSize * 0.3;  // 30% of the larger size

              // Only apply if the balanced sizes still fit within constraints
              const newPrefixStroke = Math.min(balancedPrefixSize * 0.25, prefixStrokeCap);
              if (territory.guild.prefix) {
                const chars = territory.guild.prefix.length;
                const widthFactor = 1.2;
                const estNewPrefixWidth = chars * balancedPrefixSize * widthFactor + newPrefixStroke;
                const estNewPrefixHeight = balancedPrefixSize + newPrefixStroke * 2;

                if (estNewPrefixWidth <= boxWidth * 0.98 && estNewPrefixHeight <= boxHeight * 0.9) {
                  prefixFontSize = Math.max(12, balancedPrefixSize);
                  timerFontSize = Math.max(8, balancedTimerSize);
                }
              }
            }

            // Final constraint: timer should be at most 80% of prefix size
            timerFontSize = Math.min(timerFontSize, prefixFontSize * 0.8);

            // If timer would extend past bottom, move it up
            const estTimerStroke = Math.min(timerFontSize * 0.25, timerStrokeCap);
            const estTimerHeight = timerFontSize + estTimerStroke * 2;
            if (timerY + estTimerHeight / 2 > boxBottom) {
              timerY = boxBottom - estTimerHeight / 2;
            }
            return (
              <text
                x={(topLeft[0] + bottomRight[0]) / 2}
                y={timerY}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={timerFontSize}
                fontWeight="bold"
                fill={timerColor}
                pointerEvents="none"
                stroke="#000"
                strokeWidth={estTimerStroke}
                style={{
                  fontFamily: 'Arial Black, Arial, sans-serif',
                  letterSpacing: '1px',
                  paintOrder: 'stroke fill',
                  textRendering: 'geometricPrecision',
                  shapeRendering: 'geometricPrecision',
                }}
              >
                {timerText}
              </text>
            );
          })()}
        </>
      )}
      {/* HQ marker — gold star in the top-right corner of guild headquarters (live API flag) */}
      {territory.hq && (() => {
        const starSize = Math.max(16, fontSize * 0.6);
        const starX = topRight[0] - starSize / 2 - 6;
        const starY = topRight[1] + starSize / 2 + 6;
        return (
          <text
            x={starX}
            y={starY}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontSize={starSize}
            fill="#FFD700"
            stroke="#000"
            strokeWidth={Math.max(1.5, starSize * 0.12)}
            pointerEvents="none"
            style={{
              paintOrder: 'stroke fill',
              textRendering: 'geometricPrecision',
            }}
          >
            ★
          </text>
        );
      })()}
    </svg>
  );
}

// Memoized: with stable props from the parent, overlays skip re-rendering
// during panning/hover entirely; zoom still re-renders (font sizes depend on it).
export default React.memo(TerritoryOverlay);
