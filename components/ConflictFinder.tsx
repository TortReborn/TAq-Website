"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ExchangeStore } from "@/lib/history-data";
import {
  detectConflicts,
  groupConflictsIntoWars,
  ConflictEvent,
  War,
  ALL_REGIONS,
} from "@/lib/conflict-detection";

interface ConflictFinderProps {
  isOpen: boolean;
  onClose: () => void;
  exchangeStore: ExchangeStore | null;
  ensureExchangeData: () => Promise<ExchangeStore | null>;
  onJumpToTime: (start: Date, end: Date) => void;
  onCreateFactions: (factionGuilds: string[][]) => void;
}

const DEFAULT_HEIGHT = 480;
const MIN_HEIGHT = 200;
const MAX_HEIGHT = 900;

// Faction colors palette (up to 4)
const FACTION_COLORS = ["#ef5350", "#42a5f5", "#66bb6a", "#ffa726"];

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

const inputStyle: React.CSSProperties = {
  padding: "0.3rem 0.5rem",
  borderRadius: "0.35rem",
  border: "1px solid var(--border-color)",
  background: "var(--bg-card)",
  color: "var(--text-primary)",
  fontSize: "0.75rem",
  outline: "none",
  colorScheme: "dark",
  width: "100%",
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

/** Confidence label and color */
function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.7) return { text: "High", color: "#66bb6a" };
  if (c >= 0.4) return { text: "Med", color: "#ffa726" };
  return { text: "Low", color: "#ef5350" };
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
  const [sortBy, setSortBy] = useState<"size" | "date" | "strategic">("size");
  const [guildSearch, setGuildSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [store, setStore] = useState<ExchangeStore | null>(exchangeStore);
  const [allConflicts, setAllConflicts] = useState<ConflictEvent[]>([]);
  const [expandedWars, setExpandedWars] = useState<Set<string>>(new Set());
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
          const maxH = Math.min(MAX_HEIGHT, window.innerHeight - (resizeStart.current.posY + 16));
          const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, resizeStart.current.height + delta));
          setPanelHeight(newHeight);
        } else {
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
    if ((e.target as HTMLElement).closest("button, select, input")) return;
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

  // Detect conflicts asynchronously to avoid blocking the main thread
  useEffect(() => {
    if (!store) { setAllConflicts([]); return; }
    let cancelled = false;
    setIsDetecting(true);
    const handle = setTimeout(() => {
      try {
        const result = detectConflicts(store);
        if (!cancelled) {
          setAllConflicts(result);
          setIsDetecting(false);
        }
      } catch {
        if (!cancelled) setIsDetecting(false);
      }
    }, 0);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [store]);

  // Group into wars
  const wars = useMemo(() => {
    return groupConflictsIntoWars(allConflicts);
  }, [allConflicts]);

  // Get set of conflict IDs that belong to a war (for deduplication)
  const warConflictIds = useMemo(() => {
    const ids = new Set<string>();
    for (const war of wars) {
      for (const c of war.conflicts) {
        ids.add(c.id);
      }
    }
    return ids;
  }, [wars]);

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

    if (guildSearch.trim()) {
      const search = guildSearch.trim().toLowerCase();
      result = result.filter(c =>
        c.factions.some(f =>
          f.guilds.some(g =>
            g.name.toLowerCase().includes(search) ||
            g.prefix.toLowerCase().includes(search)
          )
        )
      );
    }

    if (sortBy === "date") {
      result = [...result].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
    } else if (sortBy === "strategic") {
      result = [...result].sort((a, b) => b.weightedExchanges - a.weightedExchanges);
    }

    return result;
  }, [allConflicts, regionFilter, guildSearch, sortBy]);

  // Standalone conflicts (not part of any war)
  const standaloneConflicts = useMemo(() => {
    return filteredConflicts.filter(c => !warConflictIds.has(c.id));
  }, [filteredConflicts, warConflictIds]);

  // Filtered wars (keep wars that have at least one conflict in filteredConflicts)
  const filteredWars = useMemo(() => {
    const filteredIds = new Set(filteredConflicts.map(c => c.id));
    return wars.filter(w => w.conflicts.some(c => filteredIds.has(c.id)));
  }, [wars, filteredConflicts]);


  if (!isOpen) return null;

  const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

  const toggleWar = (warId: string) => {
    setExpandedWars(prev => {
      const next = new Set(prev);
      if (next.has(warId)) next.delete(warId);
      else next.add(warId);
      return next;
    });
  };

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
          flexWrap: "wrap",
        }}
      >
        <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          Region:
        </label>
        <select
          value={regionFilter}
          onChange={e => setRegionFilter(e.target.value)}
          style={{ ...selectStyle, flex: 1, minWidth: "80px" }}
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
          onChange={e => setSortBy(e.target.value as "size" | "date" | "strategic")}
          style={selectStyle}
        >
          <option value="size">Activity</option>
          <option value="date">Recent</option>
          <option value="strategic">Strategic</option>
        </select>
      </div>

      {/* Guild search row */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          padding: "0.35rem 0.75rem",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        <label style={{ color: "var(--text-secondary)", fontSize: "0.75rem", whiteSpace: "nowrap" }}>
          Guild:
        </label>
        <input
          type="text"
          value={guildSearch}
          onChange={e => setGuildSearch(e.target.value)}
          placeholder="Search guild name or prefix..."
          style={inputStyle}
        />
      </div>

      {/* Content area */}
      <div
        className="themed-scrollbar"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0.5rem",
          minHeight: 0,
        }}
      >
        {(loading || isDetecting) && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
          }}>
            {loading ? "Loading exchange data..." : "Analyzing conflicts..."}
          </div>
        )}

        {!loading && !isDetecting && store && allConflicts.length === 0 && (
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

        {!loading && !isDetecting && filteredConflicts.length === 0 && allConflicts.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
          }}>
            No conflicts match filters.
          </div>
        )}

        {/* Wars (collapsible groups) */}
        {filteredWars.map(war => (
          <WarGroup
            key={war.id}
            war={war}
            expanded={expandedWars.has(war.id)}
            onToggle={() => toggleWar(war.id)}
            onJump={onJumpToTime}
            onCreateFactions={onCreateFactions}
          />
        ))}

        {/* Standalone conflicts (not part of any war) */}
        {standaloneConflicts.map(conflict => (
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
// Timeline Sparkline
// ---------------------------------------------------------------------------

function TimelineSparkline({
  data,
  filteredIds,
}: {
  data: { minTime: number; maxTime: number; span: number; conflicts: ConflictEvent[] };
  filteredIds: Set<string>;
}) {
  const WIDTH = 380;
  const HEIGHT = 24;

  return (
    <div style={{
      padding: "0.25rem 0.75rem",
      borderBottom: "1px solid var(--border-color)",
      flexShrink: 0,
    }}>
      <svg width="100%" height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        {data.conflicts.map(c => {
          const x = ((c.startTime.getTime() - data.minTime) / data.span) * WIDTH;
          const w = Math.max(2, ((c.endTime.getTime() - c.startTime.getTime()) / data.span) * WIDTH);
          const intensity = Math.min(1, c.peakHourly / 80);
          const isFiltered = filteredIds.has(c.id);
          return (
            <rect
              key={c.id}
              x={x}
              y={2}
              width={w}
              height={HEIGHT - 4}
              rx={2}
              fill={isFiltered ? `rgba(245, 124, 0, ${0.3 + intensity * 0.7})` : "rgba(128,128,128,0.15)"}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// War group (collapsible)
// ---------------------------------------------------------------------------

function WarGroup({
  war,
  expanded,
  onToggle,
  onJump,
  onCreateFactions,
}: {
  war: War;
  expanded: boolean;
  onToggle: () => void;
  onJump: (start: Date, end: Date) => void;
  onCreateFactions: (factionGuilds: string[][]) => void;
}) {
  return (
    <div style={{
      marginBottom: "0.5rem",
      border: "1px solid var(--border-color)",
      borderRadius: "0.5rem",
      overflow: "hidden",
    }}>
      {/* War header */}
      <div
        onClick={onToggle}
        style={{
          padding: "0.5rem 0.7rem",
          background: "var(--bg-secondary)",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: "0.78rem" }}>
            {war.name}
          </span>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.68rem", marginLeft: "0.4rem" }}>
            {war.conflicts.length} battles · {war.totalExchanges} exchanges
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ color: "var(--text-secondary)", fontSize: "0.65rem" }}>
            {formatDate(war.startTime)} — {formatDate(war.endTime)}
          </span>
          <span style={{
            color: "var(--text-secondary)",
            fontSize: "0.8rem",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}>
            ▾
          </span>
        </div>
      </div>

      {/* Expanded: show constituent conflicts */}
      {expanded && (
        <div style={{ padding: "0.3rem" }}>
          {war.conflicts.map(conflict => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              onJump={onJump}
              onCreateFactions={onCreateFactions}
            />
          ))}
        </div>
      )}
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
  onJump: (start: Date, end: Date) => void;
  onCreateFactions: (factionGuilds: string[][]) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const duration = formatDuration(conflict.startTime, conflict.endTime);
  const conf = confidenceLabel(conflict.confidence);

  // Build region summary
  const regionSummary = Object.entries(conflict.regionBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([region, count]) => `${region} (${count})`)
    .join(" + ");

  // Intensity indicator
  const intensity = conflict.peakHourly >= 80 ? 3 : conflict.peakHourly >= 40 ? 2 : 1;

  return (
    <div
      onClick={() => onJump(conflict.startTime, conflict.endTime)}
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
      {/* Top row: name + stats + buttons */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "0.3rem",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0, flex: 1 }}>
          <span style={{
            color: "var(--text-primary)",
            fontWeight: 600,
            fontSize: "0.78rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {conflict.name}
          </span>
          {/* Confidence badge */}
          <span style={{
            fontSize: "0.55rem",
            fontWeight: 600,
            color: conf.color,
            border: `1px solid ${conf.color}`,
            borderRadius: "0.2rem",
            padding: "0 0.2rem",
            lineHeight: "1.4",
            flexShrink: 0,
          }}>
            {conf.text}
          </span>
          {conflict.isMultiFront && (
            <span style={{
              fontSize: "0.55rem",
              fontWeight: 600,
              color: "#ce93d8",
              border: "1px solid #ce93d8",
              borderRadius: "0.2rem",
              padding: "0 0.2rem",
              lineHeight: "1.4",
              flexShrink: 0,
            }}>
              Multi
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0 }}>
          <span style={{
            color: "var(--text-secondary)",
            fontSize: "0.65rem",
          }}>
            {conflict.totalExchanges} · {duration}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              const factionGuilds = conflict.factions.map(f => f.guilds.map(g => g.name));
              onCreateFactions(factionGuilds);
            }}
            title="Load factions for visualization"
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

      {/* Date line */}
      <div style={{ color: "var(--text-secondary)", fontSize: "0.65rem", marginBottom: "0.2rem" }}>
        {formatDate(conflict.startTime)}
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

      {/* Factions display (up to 4 with distinct colors) */}
      {conflict.factions.length > 0 && (
        <div style={{
          fontSize: "0.72rem",
          color: "var(--text-primary)",
          display: "flex",
          alignItems: "center",
          gap: "0.3rem",
          flexWrap: "wrap",
        }}>
          {conflict.factions.slice(0, 4).map((faction, idx) => {
            const prefixes = faction.guilds.slice(0, 4).map(g => g.prefix).join(", ");
            const hasMore = faction.guilds.length > 4;
            const color = FACTION_COLORS[idx] || "var(--text-secondary)";
            return (
              <React.Fragment key={idx}>
                {idx > 0 && (
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.6rem" }}>vs</span>
                )}
                <span style={{ color, fontWeight: 500 }}>
                  {prefixes || "??"}{hasMore ? "..." : ""}
                </span>
              </React.Fragment>
            );
          })}
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
          <div>Peak: {conflict.peakHourly}/hr · {conflict.territoriesInvolved} territories · Confidence: {(conflict.confidence * 100).toFixed(0)}%</div>
          {conflict.factions.length > 2 && (
            <div style={{ color: "#ce93d8" }}>{conflict.factions.length} factions detected</div>
          )}
          <div style={{ marginTop: "0.15rem", color: "var(--text-primary)", fontSize: "0.65rem" }}>
            Click to jump to this conflict
          </div>
        </div>
      )}
    </div>
  );
}
