"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ExchangeStore } from "@/lib/history-data";
import { detectConflicts, ConflictEvent, ALL_REGIONS } from "@/lib/conflict-detection";

interface ConflictFinderProps {
  isOpen: boolean;
  onClose: () => void;
  exchangeStore: ExchangeStore | null;
  ensureExchangeData: () => Promise<ExchangeStore | null>;
  onJumpToTime: (date: Date) => void;
  onCreateFactions: (side1Guilds: string[], side2Guilds: string[]) => void;
}

const DEFAULT_HEIGHT = 480;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 900;

// Custom themed select dropdown arrow (SVG data URI)
const SELECT_ARROW = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

const selectStyle: React.CSSProperties = {
  padding: "0.3rem 1.4rem 0.3rem 0.5rem",
  borderRadius: "0.35rem",
  border: "1px solid var(--border-color)",
  background: `var(--bg-card) ${SELECT_ARROW} no-repeat right 0.35rem center`,
  color: "var(--text-primary)",
  fontSize: "0.75rem",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
  outline: "none",
  colorScheme: "dark",
};

function formatDuration(start: Date, end: Date): string {
  const ms = end.getTime() - start.getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConflictFinder({
  isOpen,
  onClose,
  exchangeStore,
  ensureExchangeData,
  onJumpToTime,
  onCreateFactions,
}: ConflictFinderProps) {
  const [regionFilter, setRegionFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"size" | "date">("size");
  const [loading, setLoading] = useState(false);
  const [store, setStore] = useState<ExchangeStore | null>(exchangeStore);
  const panelRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Resize state
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const isResizing = useRef<"top" | "bottom" | false>(false);
  const resizeStart = useRef({ y: 0, height: DEFAULT_HEIGHT, posY: 0 });

  // Sync external store changes
  useEffect(() => {
    if (exchangeStore) setStore(exchangeStore);
  }, [exchangeStore]);

  // Load exchange data when panel opens
  useEffect(() => {
    if (!isOpen) return;
    if (store) return;

    let cancelled = false;
    setLoading(true);
    ensureExchangeData().then((result) => {
      if (!cancelled) {
        setStore(result);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [isOpen, store, ensureExchangeData]);

  // Initialize position on first open
  useEffect(() => {
    if (isOpen && position === null) {
      setPosition({
        x: Math.max(0, window.innerWidth - 480),
        y: Math.max(0, Math.min(80, window.innerHeight - 600)),
      });
    }
  }, [isOpen, position]);

  // Clamp position within viewport
  const clampPosition = useCallback((x: number, y: number) => {
    const panelW = panelRef.current?.offsetWidth || 440;
    const panelH = panelRef.current?.offsetHeight || panelHeight;
    return {
      x: Math.max(0, Math.min(x, window.innerWidth - panelW)),
      y: Math.max(0, Math.min(y, window.innerHeight - panelH)),
    };
  }, [panelHeight]);

  // Drag + resize handlers on document
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const clamped = clampPosition(
          e.clientX - dragOffset.current.x,
          e.clientY - dragOffset.current.y
        );
        setPosition(clamped);
        return;
      }

      if (isResizing.current) {
        const delta = e.clientY - resizeStart.current.y;

        if (isResizing.current === "bottom") {
          // Bottom handle: grow/shrink downward
          const maxH = Math.min(MAX_HEIGHT, window.innerHeight - (resizeStart.current.posY + 16));
          const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, resizeStart.current.height + delta));
          setPanelHeight(newHeight);
        } else {
          // Top handle: grow/shrink upward — move position.y accordingly
          const maxH = Math.min(MAX_HEIGHT, resizeStart.current.posY + resizeStart.current.height - 16);
          const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, resizeStart.current.height - delta));
          const heightDiff = newHeight - resizeStart.current.height;
          setPanelHeight(newHeight);
          setPosition(prev => prev ? { ...prev, y: resizeStart.current.posY - heightDiff } : prev);
        }
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
      isResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [clampPosition]);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button, select")) return;
    isDragging.current = true;
    dragOffset.current = {
      x: e.clientX - (position?.x || 0),
      y: e.clientY - (position?.y || 0),
    };
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    e.preventDefault();
    e.stopPropagation();
  };

  const onResizeMouseDown = (side: "top" | "bottom") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing.current = side;
    resizeStart.current = {
      y: e.clientY,
      height: panelHeight,
      posY: position?.y || 0,
    };
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  };

  // Detect conflicts (memoized on store reference)
  const allConflicts = useMemo(() => {
    if (!store) return [];
    return detectConflicts(store);
  }, [store]);

  // Filter and sort
  const filteredConflicts = useMemo(() => {
    let result = allConflicts;

    if (regionFilter !== "All") {
      result = result.filter(c => {
        if (c.primaryRegion === regionFilter) return true;
        const regionCount = c.regionBreakdown[regionFilter] || 0;
        return regionCount >= c.totalExchanges * 0.25;
      });
    }

    if (sortBy === "date") {
      result = [...result].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    }

    return result;
  }, [allConflicts, regionFilter, sortBy]);

  if (!isOpen) return null;

  const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={panelRef}
      style={{
        position: "fixed",
        left: position ? `${position.x}px` : "auto",
        top: position ? `${position.y}px` : "auto",
        width: "420px",
        maxWidth: "90vw",
        height: `${panelHeight}px`,
        backgroundColor: "var(--bg-card-solid)",
        border: "2px solid var(--border-color)",
        borderRadius: "0.75rem",
        boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
      }}
      onWheel={stopPropagation}
      onMouseDown={stopPropagation}
      onMouseMove={stopPropagation}
      onMouseUp={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchMove={stopPropagation}
      onTouchEnd={stopPropagation}
    >
      {/* Top resize handle */}
      <div
        onMouseDown={onResizeMouseDown("top")}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "6px",
          cursor: "ns-resize",
          zIndex: 10,
          borderRadius: "0.75rem 0.75rem 0 0",
        }}
      />

      {/* Header - drag handle */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--border-color)",
          cursor: "grab",
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="22" y1="12" x2="18" y2="12" />
            <line x1="6" y1="12" x2="2" y2="12" />
            <line x1="12" y1="6" x2="12" y2="2" />
            <line x1="12" y1="22" x2="12" y2="18" />
          </svg>
          <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.85rem" }}>
            Conflict Finder
          </span>
          {allConflicts.length > 0 && (
            <span style={{ color: "var(--text-secondary)", fontSize: "0.7rem" }}>
              ({filteredConflicts.length})
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            width: "1.5rem",
            height: "1.5rem",
            borderRadius: "0.25rem",
            border: "none",
            background: "transparent",
            color: "var(--text-secondary)",
            cursor: "pointer",
            fontSize: "1.1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ×
        </button>
      </div>

      {/* Filter row */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.5rem 0.75rem",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          Region:
        </label>
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="All">All</option>
          <option value="Global">Global (multi-region)</option>
          {ALL_REGIONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          Sort:
        </label>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as "size" | "date")}
          style={selectStyle}
        >
          <option value="size">Activity</option>
          <option value="date">Recent</option>
        </select>
      </div>

      {/* Content area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.5rem",
          minHeight: 0,
        }}
      >
        {loading && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
          }}>
            Loading exchange data...
          </div>
        )}

        {!loading && store && allConflicts.length === 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
          }}>
            No significant conflicts found.
          </div>
        )}

        {!loading && filteredConflicts.length === 0 && allConflicts.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
          }}>
            No conflicts in this region.
          </div>
        )}

        {filteredConflicts.map(conflict => (
          <ConflictCard
            key={conflict.id}
            conflict={conflict}
            onJump={onJumpToTime}
            onCreateFactions={onCreateFactions}
          />
        ))}
      </div>

      {/* Bottom resize handle */}
      <div
        onMouseDown={onResizeMouseDown("bottom")}
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "6px",
          cursor: "ns-resize",
          zIndex: 10,
          borderRadius: "0 0 0.75rem 0.75rem",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflict card
// ---------------------------------------------------------------------------

function ConflictCard({
  conflict,
  onJump,
  onCreateFactions,
}: {
  conflict: ConflictEvent;
  onJump: (date: Date) => void;
  onCreateFactions: (side1Guilds: string[], side2Guilds: string[]) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const duration = formatDuration(conflict.startTime, conflict.endTime);

  // Build region summary
  const regionSummary = Object.entries(conflict.regionBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([region, count]) => `${region} (${count})`)
    .join(" + ");

  // Build sides summary (top 4 prefixes per side)
  const side1 = conflict.sides[0].guilds.slice(0, 4).map(g => g.prefix).join(", ");
  const side2 = conflict.sides[1].guilds.slice(0, 4).map(g => g.prefix).join(", ");
  const hasMoreSide1 = conflict.sides[0].guilds.length > 4;
  const hasMoreSide2 = conflict.sides[1].guilds.length > 4;

  // Intensity indicator
  const intensity = conflict.peakHourly >= 80 ? 3 : conflict.peakHourly >= 40 ? 2 : 1;

  return (
    <div
      onClick={() => onJump(conflict.startTime)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "0.6rem 0.7rem",
        marginBottom: "0.4rem",
        borderRadius: "0.5rem",
        border: `1px solid ${hovered ? "var(--accent-primary)" : "var(--border-color)"}`,
        background: hovered ? "var(--bg-secondary)" : "var(--bg-card)",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      {/* Top row: date + stats + factions button */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.3rem",
      }}>
        <span style={{
          color: "var(--text-primary)",
          fontWeight: 600,
          fontSize: "0.8rem",
        }}>
          {formatDate(conflict.startTime)}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span style={{
            color: "var(--text-secondary)",
            fontSize: "0.7rem",
          }}>
            {conflict.totalExchanges} exchanges · {duration}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const side1 = conflict.sides[0].guilds.map(g => g.name);
              const side2 = conflict.sides[1].guilds.map(g => g.name);
              onCreateFactions(side1, side2);
            }}
            title="Load sides as factions"
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "0.25rem",
              border: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-primary)";
              e.currentTarget.style.color = "var(--accent-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-color)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
              <line x1="4" y1="22" x2="4" y2="15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Region breakdown */}
      <div style={{
        color: "var(--text-secondary)",
        fontSize: "0.7rem",
        marginBottom: "0.25rem",
        display: "flex",
        alignItems: "center",
        gap: "0.4rem",
      }}>
        {/* Intensity dots */}
        <span style={{ display: "flex", gap: "2px" }}>
          {[1, 2, 3].map(i => (
            <span
              key={i}
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: i <= intensity ? "#f57c00" : "var(--border-color)",
              }}
            />
          ))}
        </span>
        <span>{regionSummary}</span>
      </div>

      {/* Sides */}
      {(side1 || side2) && (
        <div style={{
          fontSize: "0.72rem",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          flexWrap: "wrap",
        }}>
          <span style={{ color: "#ef5350", fontWeight: 500 }}>
            {side1 || "??"}{hasMoreSide1 ? "..." : ""}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.65rem" }}>vs</span>
          <span style={{ color: "#42a5f5", fontWeight: 500 }}>
            {side2 || "??"}{hasMoreSide2 ? "..." : ""}
          </span>
        </div>
      )}

      {/* Hover detail */}
      {hovered && (
        <div style={{
          marginTop: "0.3rem",
          paddingTop: "0.3rem",
          borderTop: "1px solid var(--border-color)",
          fontSize: "0.65rem",
          color: "var(--text-secondary)",
        }}>
          <div>{formatDateTime(conflict.startTime)} — {formatDateTime(conflict.endTime)}</div>
          <div>Peak: {conflict.peakHourly}/hr · {conflict.territoriesInvolved} territories</div>
          <div style={{ marginTop: "0.15rem", color: "var(--text-primary)", fontSize: "0.65rem" }}>
            Click to jump to this conflict
          </div>
        </div>
      )}
    </div>
  );
}
