"use client";

import React from "react";
import { Territory, getGuildColor, coordToPixel } from "@/lib/utils";

interface TerritoryOverlayProps {
  name: string;
  territory: Territory;
  scale?: number;
  isDragging?: boolean;
  onClick?: (name: string, territory: Territory) => void;
  onMouseEnter?: (name: string, territory: Territory) => void;
  onMouseLeave?: () => void;
}

export default function TerritoryOverlay({
  name,
  territory,
  scale = 1,
  isDragging = false,
  onClick,
  onMouseEnter,
  onMouseLeave
}: TerritoryOverlayProps) {
  // Use scale prop for zoom, define at top
  const zoom = scale;
  // Local drag detection
  const dragState = React.useRef({ down: false, moved: false });
  // Get four corners in pixel coordinates
  const start = coordToPixel(territory.location.start);
  const end = coordToPixel(territory.location.end);
  // Rectangle: topLeft, topRight, bottomRight, bottomLeft
  const topLeft = [Math.min(start[0], end[0]), Math.min(start[1], end[1])];
  const topRight = [Math.max(start[0], end[0]), Math.min(start[1], end[1])];
  const bottomRight = [Math.max(start[0], end[0]), Math.max(start[1], end[1])];
  const bottomLeft = [Math.min(start[0], end[0]), Math.max(start[1], end[1])];

  const points = [topLeft, topRight, bottomRight, bottomLeft].map(p => p.join(",")).join(" ");

  // Synchronous guild color
  const guildColor = getGuildColor(territory.guild.name, territory.guild.prefix);

  // SVG overlay positioned absolutely over the map
  // Dynamically size the guild tag so it fits inside the territory box
  let maxFontSize = 64;
  const margin = 12;
  const boxWidth = Math.abs(bottomRight[0] - topLeft[0]) - margin * 2;
  const boxHeight = Math.abs(bottomRight[1] - topLeft[1]) - margin * 2;
  // zoom is already defined above, do not redeclare
  // Font size scales down as zoom increases
  // At zoom 1, use maxFontSize; at zoom 2, use maxFontSize/2, etc. Clamp to min 12
    let fontSize = Math.max(12, maxFontSize / zoom);
    // Allow text and outline to use up to 98% of box width (1% gap), but keep height at 90%
    if (territory.guild.prefix) {
      const chars = territory.guild.prefix.length;
      // Use a higher widthFactor to account for bold, outline, and letter spacing
  const widthFactor = 1.2;
      const maxAllowedWidth = boxWidth * 0.98;
      const maxAllowedHeight = boxHeight * 0.9;
      // Estimate outline thickness for this font size
      let estStroke = Math.min(fontSize * 0.25, Math.max(2, Math.min(8 / zoom, 8 / 0.45)));
      // Iteratively shrink font size until text + outline fits left-right and box height
      while (fontSize > 12) {
        estStroke = Math.min(fontSize * 0.25, Math.max(2, Math.min(8 / zoom, 8 / 0.45)));
  const estTextWidth = chars * fontSize * widthFactor + estStroke;
        const estTextHeight = fontSize + estStroke * 2;
        if (estTextWidth <= maxAllowedWidth && estTextHeight <= maxAllowedHeight) break;
        fontSize--;
      }
    }

  // Show held duration under guild prefix if zoom >= 30%
  // Get zoom from window/global (passed as prop in a real app, but we can use window for now)
  // Use scale prop for zoom

  // Helper to format duration
  function formatHeldDuration(acquired: string): { text: string, color: string } {
    const now = new Date();
    const acquiredDate = new Date(acquired);
    let diff = Math.floor((now.getTime() - acquiredDate.getTime()) / 1000); // seconds
    if (isNaN(diff) || diff < 0) return { text: '', color: '' };
    let days = Math.floor(diff / 86400);
    diff -= days * 86400;
    let hours = Math.floor(diff / 3600);
    diff -= hours * 3600;
    let minutes = Math.floor(diff / 60);
    let seconds = diff - minutes * 60;
    let text = '';
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
    let color = '#b71c1c'; // dark red
    if (days >= 5) color = '#43a047'; // green
    else if (days >= 1) color = '#fbc02d'; // yellow
    else if (hours >= 1) color = '#fb8c00'; // orange
    else if (minutes >= 10) color = '#e57373'; // light red
    return { text, color };
  }

  return (
    <svg
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
        fill={guildColor + "40"}
        stroke={guildColor}
        strokeWidth={8}
        style={{ pointerEvents: "auto", cursor: "pointer" }}
        onPointerDown={e => {
          dragState.current.down = true;
          dragState.current.moved = false;
        }}
        onPointerMove={e => {
          if (dragState.current.down) dragState.current.moved = true;
        }}
        onPointerUp={e => {
          dragState.current.down = false;
        }}
        onClick={e => {
          // Only trigger onClick if not dragging and if pointer didn't move
          if (isDragging || dragState.current.moved) return;
          onClick?.(name, territory);
        }}
        onMouseEnter={() => onMouseEnter?.(name, territory)}
        onMouseLeave={onMouseLeave}
      />
      {/* Guild tag centered in territory, bold white blocky font with black outline */}
      {territory.guild.prefix && (
        <>
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
            strokeWidth={Math.min(fontSize * 0.25, Math.max(2, Math.min(8 / zoom, 8 / 0.45)))}
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
          {zoom >= 0.3 && territory.acquired && (() => {
            const { text, color } = formatHeldDuration(territory.acquired);
            if (!text) return null;
            
            // For timer font size, use a more balanced approach
            // Start with a base size that's closer to the guild prefix size
            // Use the minimum of: 90% of guild size, or a size based on territory dimensions
            const baseSizeFromGuild = fontSize * 0.9;
            const baseSizeFromTerritory = Math.min(
              (boxWidth * 0.98) / (text.length * 0.65), // Width-based sizing
              boxHeight * 0.25 // Height-based sizing (use 25% of available height)
            );
            let timerFontSize = Math.max(8, Math.min(baseSizeFromGuild, baseSizeFromTerritory));
            
            const maxAllowedWidth = boxWidth * 0.98;
            const maxAllowedHeight = boxHeight * 0.9;
            
            // Estimate stroke thickness for timer text
            let estTimerStroke = Math.min(timerFontSize * 0.25, Math.max(1, Math.min(5 / zoom, 5 / 0.45)));
            
            // For timer text, only constrain by height and bottom position, not width
            // This prevents tiny timer text in wide territories
            const centerY = (topLeft[1] + bottomRight[1]) / 2;
            const boxBottom = bottomRight[1] - margin - boxHeight * 0.05;
            let timerY = centerY + fontSize + 8;
            while (timerFontSize > 8) { // Lower minimum for timer text
              estTimerStroke = Math.min(timerFontSize * 0.25, Math.max(1, Math.min(5 / zoom, 5 / 0.45)));
              const estTimerHeight = timerFontSize + estTimerStroke * 2;
              // Only check height and bottom position, not width for timer
              if (
                estTimerHeight <= maxAllowedHeight &&
                timerY + estTimerHeight / 2 <= boxBottom
              ) break;
              timerFontSize--;
            }
            
            // Balance check: If there's a large disparity between prefix and timer sizes, balance them
            const sizeRatio = fontSize / timerFontSize;
            if (sizeRatio > 2.5) { // If prefix is more than 2.5x larger than timer
              // Calculate a more balanced pair of sizes based on the larger font size
              const baseSize = Math.max(fontSize, timerFontSize);
              const balancedPrefixSize = baseSize * 0.7; // 70% of the larger size
              const balancedTimerSize = baseSize * 0.3;  // 30% of the larger size
              
              // Only apply if the balanced sizes still fit within constraints
              const newPrefixStroke = Math.min(balancedPrefixSize * 0.25, Math.max(2, Math.min(8 / zoom, 8 / 0.45)));
              const newTimerStroke = Math.min(balancedTimerSize * 0.25, Math.max(1, Math.min(5 / zoom, 5 / 0.45)));
              
              if (territory.guild.prefix) {
                const chars = territory.guild.prefix.length;
                const widthFactor = 1.2;
                const estNewPrefixWidth = chars * balancedPrefixSize * widthFactor + newPrefixStroke;
                const estNewPrefixHeight = balancedPrefixSize + newPrefixStroke * 2;
                
                if (estNewPrefixWidth <= boxWidth * 0.98 && estNewPrefixHeight <= boxHeight * 0.9) {
                  fontSize = Math.max(12, balancedPrefixSize);
                  timerFontSize = Math.max(8, balancedTimerSize);
                }
              }
            }
            
            // Final constraint: timer should be at most 80% of prefix size
            timerFontSize = Math.min(timerFontSize, fontSize * 0.8);
            
            // If timer would extend past bottom, move it up
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
                fill={color}
                pointerEvents="none"
                stroke="#000"
                strokeWidth={Math.min(timerFontSize * 0.25, Math.max(1, Math.min(5 / zoom, 5 / 0.45)))}
                style={{
                  fontFamily: 'Arial Black, Arial, sans-serif',
                  letterSpacing: '1px',
                  paintOrder: 'stroke fill',
                  textRendering: 'geometricPrecision',
                  shapeRendering: 'geometricPrecision',
                }}
              >
                {text}
              </text>
            );
          })()}
        </>
      )}
    </svg>
  );
}
