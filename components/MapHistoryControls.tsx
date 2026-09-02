"use client";

import { memo, useState, useRef, useCallback, useEffect, useMemo } from "react";
import {
  MoveHorizontal,
  MoveVertical,
  RefreshCw,
  Crosshair,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Play,
  Pause,
} from "lucide-react";
import HistoryTimeline, { SeasonZoom, TimelineEventMarker, TimelineAllianceSpan } from "./HistoryTimeline";
import { SeasonPeriod } from "@/lib/seasons";
import HistoryDatePicker from "./HistoryDatePicker";
import HistoryPlayback from "./HistoryPlayback";
import PickerField from "./PickerField";

interface MapHistoryControlsProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onTimeChange: (date: Date) => void;
  onJump: (date: Date) => void;
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onSpeedChange: (speed: number) => void;
  onStepForward: () => void;
  onStepBackward: () => void;
  onJumpToStart: () => void;
  onJumpToEnd: () => void;
  canStepForward: boolean;
  canStepBackward: boolean;
  isLoading?: boolean;
  onRefresh?: () => void;
  containerBounds?: { width: number; height: number };
  gaps?: Array<{ start: Date; end: Date }>;
  conflictBounds?: { start: Date; end: Date } | null;
  isConflictFocused?: boolean;
  onConflictFocusToggle?: () => void;
  seasons?: SeasonPeriod[]; // On/off-season periods for timeline context
  loadProgress?: number; // 0..1 — fraction of the timeline covered by loaded events
  eventMarkers?: TimelineEventMarker[]; // Chronicle events shown on the track
  allianceSpans?: TimelineAllianceSpan[]; // Chronicle alliance lifetime bands
}

// Playback speeds: minutes of history per real second. Labels state the
// literal rate so each tier is meaningful at a glance. The top tier matches
// the old "Fast" mode (1 day per 100ms tick = 10 days/s).
const SPEED_OPTIONS = [10, 30, 60, 360, 1440, 14400];
const ALL_SPEED_OPTIONS = SPEED_OPTIONS;

function speedLabel(s: number): string {
  if (s < 60) return `${s} min/s`;
  if (s < 1440) return `${s / 60} hr/s`;
  const days = s / 1440;
  return days === 1 ? '1 day/s' : `${days} days/s`;
}

// Visible grabber pill shown inside each edge-resize hitbox
const resizePillStyle: React.CSSProperties = {
  width: '5px',
  height: '36px',
  borderRadius: '999px',
  background: 'var(--border-color)',
  border: '1px solid var(--bg-card-solid)',
  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
};
const MIN_WIDTH = 280;
const MAX_WIDTH = 1800;
// Wide enough for the 10rem control rows next to the slider column — at 248
// the date/time inputs and Jump button were clipped at the panel edge.
const VERTICAL_WIDTH = 276;
const DEFAULT_VERTICAL_HEIGHT = 350;
const MIN_VERTICAL_HEIGHT = 242;
const MAX_VERTICAL_HEIGHT = 1040;

function vBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    height: '32px',
    boxSizing: 'border-box',
    padding: '0 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid var(--border-color)',
    background: 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    cursor: enabled ? 'pointer' : 'not-allowed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
    opacity: enabled ? 1 : 0.4,
    flexShrink: 0,
  };
}

function MapHistoryControls({
  earliest,
  latest,
  current,
  onTimeChange,
  onJump,
  isPlaying,
  speed,
  onPlayPause,
  onSpeedChange,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  canStepForward,
  canStepBackward,
  isLoading,
  onRefresh,
  containerBounds,
  gaps,
  conflictBounds,
  isConflictFocused,
  onConflictFocusToggle,
  seasons,
  loadProgress,
  eventMarkers,
  allianceSpans,
}: MapHistoryControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | 'top' | 'bottom' | false>(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(1200);
  const [verticalHeight, setVerticalHeight] = useState(DEFAULT_VERTICAL_HEIGHT);
  const [isVertical, setIsVertical] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement>(null);
  // Season zoom shared between the track (right-click) and the selector below
  const [seasonZoom, setSeasonZoom] = useState<SeasonZoom | null>(null);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const seasonSelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 1200, height: DEFAULT_VERTICAL_HEIGHT, posX: 0, posY: 0 });

  // Cap the horizontal panel to the space between the map's corner control
  // columns. The stored width (default 1200) is wider than a laptop viewport
  // once both columns are accounted for, which pushed the panel's own edge
  // buttons underneath them. Purely a display cap — the user's chosen width is
  // still what gets persisted, so it comes back on a wider window.
  const maxUsableWidth = containerBounds
    ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, containerBounds.width - 32))
    : MAX_WIDTH;
  // Deliberately not Math.min(width, maxUsableWidth): capping only the rendered
  // value pins the panel's size while the resize handler keeps shifting
  // position.x by half the width delta, so dragging an edge slid the panel
  // sideways instead of resizing it. The cap is enforced on the width state
  // itself (in the resize handler and the fit effect below) instead.
  const panelWidth = isVertical ? VERTICAL_WIDTH : width;

  // Display strings derived from `current` — recomputed only when the timestamp changes
  const currentMs = current.getTime();
  const currentDisplay = useMemo(() => {
    const d = new Date(currentMs);
    return {
      dateTimeLabel: d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      dateValue: d.toISOString().split('T')[0],
      timeValue: `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`,
    };
  }, [currentMs]);

  // Layout breakpoints based on component widths (horizontal mode only)
  const showSpeedInPlayback = panelWidth >= 540;
  const stackDateRow = panelWidth < 420;

  // Clamp position to the map container's edges only. The panel may slide
  // underneath the permanent fixtures (zoom stack, mode/settings cluster,
  // territory leaders tab) — those render above it, and the user can drag
  // the panel back out.
  const clampPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current || !containerBounds) return { x, y };
    const halfWidth = panelWidth / 2;
    const panelHeight = containerRef.current.offsetHeight;
    const maxX = Math.max(0, containerBounds.width / 2 - halfWidth);
    const minX = -maxX;
    const maxY = 0;
    const minY = -(containerBounds.height - panelHeight - 16);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, [panelWidth, containerBounds]);

  // Keyboard shortcuts — active while the history panel is mounted.
  // Ignored when the user is typing in an input/select (date pickers etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const DAY_MS = 24 * 60 * 60 * 1000;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          onPlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (e.shiftKey) {
            onJump(new Date(Math.min(latest.getTime(), current.getTime() + DAY_MS)));
          } else if (canStepForward) {
            onStepForward();
          }
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (e.shiftKey) {
            onJump(new Date(Math.max(earliest.getTime(), current.getTime() - DAY_MS)));
          } else if (canStepBackward) {
            onStepBackward();
          }
          break;
        case 'Home':
          e.preventDefault();
          onJumpToStart();
          break;
        case 'End':
          e.preventDefault();
          onJumpToEnd();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPlayPause, onStepForward, onStepBackward, onJumpToStart, onJumpToEnd, onJump, canStepForward, canStepBackward, current, earliest, latest]);

  // Close speed dropdown on outside click
  useEffect(() => {
    if (!speedOpen) return;
    const handler = (e: MouseEvent) => {
      if (speedRef.current && !speedRef.current.contains(e.target as Node)) {
        setSpeedOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [speedOpen]);

  // Close season dropdown on outside click
  useEffect(() => {
    if (!seasonOpen) return;
    const handler = (e: MouseEvent) => {
      if (seasonSelRef.current && !seasonSelRef.current.contains(e.target as Node)) {
        setSeasonOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [seasonOpen]);

  // Seasons newest-first for the selector (off-season periods are reachable
  // by right-clicking the track, so the list stays short)
  const seasonOptions = useMemo(
    () => (seasons ?? []).filter((p) => p.type === 'season').slice().reverse(),
    [seasons]
  );

  // Leave season view automatically when the current time moves outside the
  // zoomed window (date-picker jump, playback running past the season end...).
  // The zoom only arms once the scrubber has actually been inside the window —
  // otherwise selecting a season would cancel itself before its own jump lands.
  const zoomEnteredRef = useRef(false);
  useEffect(() => {
    if (!seasonZoom) return;
    zoomEnteredRef.current = false;
  }, [seasonZoom]);
  useEffect(() => {
    if (!seasonZoom) return;
    const zs = Math.max(earliest.getTime(), seasonZoom.start.getTime());
    const ze = Math.min(latest.getTime(), seasonZoom.end.getTime());
    const cur = current.getTime();
    if (cur >= zs && cur <= ze) {
      zoomEnteredRef.current = true;
    } else if (zoomEnteredRef.current) {
      setSeasonZoom(null);
    }
  }, [current, seasonZoom, earliest, latest]);

  const handleSeasonSelect = useCallback((p: SeasonPeriod | null) => {
    setSeasonOpen(false);
    if (!p) {
      setSeasonZoom(null);
      return;
    }
    setSeasonZoom({ start: p.start, end: p.end, label: p.label });
    // Bring the scrubber into the zoomed range if it's currently outside it
    const zs = Math.max(earliest.getTime(), p.start.getTime());
    const ze = Math.min(latest.getTime(), p.end.getTime());
    if (current.getTime() < zs || current.getTime() > ze) {
      onJump(new Date(zs));
    }
  }, [earliest, latest, current, onJump]);

  // Load cached state on mount
  useEffect(() => {
    const cachedPos = localStorage.getItem('historyControlsPosition');
    const cachedWidth = localStorage.getItem('historyControlsWidth');
    const cachedVertical = localStorage.getItem('historyControlsVertical');
    const cachedVHeight = localStorage.getItem('historyControlsVerticalHeight');
    if (cachedPos) {
      try {
        setPosition(JSON.parse(cachedPos));
      } catch { /* ignore */ }
    }
    if (cachedWidth) {
      const w = parseInt(cachedWidth, 10);
      if (!isNaN(w)) setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)));
    }
    if (cachedVertical === 'true') {
      setIsVertical(true);
    }
    if (cachedVHeight) {
      const h = parseInt(cachedVHeight, 10);
      if (!isNaN(h)) setVerticalHeight(Math.max(MIN_VERTICAL_HEIGHT, Math.min(MAX_VERTICAL_HEIGHT, h)));
    }
    setIsInitialized(true);
  }, []);

  // Keep the panel inside the map container.
  //
  // The restore above deliberately does not clamp: on mount neither the
  // container bounds nor the panel's own height are known yet. This runs once
  // they are, and again whenever the container resizes or the panel changes
  // shape — so an offset saved on a wide window can't strand the panel over
  // the map's control column (or off-screen entirely) on a smaller one.
  // Without it the bad offset is re-saved on every visit and never recovers.
  useEffect(() => {
    if (!isInitialized || !containerBounds) return;
    // Never clamp mid-gesture. Resizing updates width and position.x together to
    // keep the dragged edge anchored; re-clamping on each width tick recomputes
    // a narrower x-range and pulls x back toward centre, so the panel slides
    // sideways instead of resizing. The handlers own position while active —
    // this runs once the gesture ends.
    if (isDragging || isResizing) return;
    // Shrink to fit first — a width saved on a wide window would otherwise keep
    // the panel wider than the space between the map's corner controls.
    setWidth((w) => Math.min(w, maxUsableWidth));
    setPosition((prev) => {
      const next = clampPosition(prev.x, prev.y);
      return next.x === prev.x && next.y === prev.y ? prev : next;
    });
  }, [isInitialized, containerBounds, clampPosition, maxUsableWidth, isVertical, width, verticalHeight, isDragging, isResizing]);

  // Save position when it changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('historyControlsPosition', JSON.stringify(position));
    }
  }, [position, isInitialized]);

  // Save width when it changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('historyControlsWidth', String(width));
    }
  }, [width, isInitialized]);

  // Save vertical when it changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('historyControlsVertical', String(isVertical));
    }
  }, [isVertical, isInitialized]);

  // Save vertical height when it changes
  useEffect(() => {
    if (isInitialized) {
      localStorage.setItem('historyControlsVerticalHeight', String(verticalHeight));
    }
  }, [verticalHeight, isInitialized]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'BUTTON' ||
      target.tagName === 'INPUT' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'OPTION' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select')
    ) {
      return;
    }

    if (target.closest('[data-timeline-track]')) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const newPos = clampPosition(
      dragStartRef.current.posX + deltaX,
      dragStartRef.current.posY + deltaY
    );
    setPosition(newPos);
  }, [isDragging, clampPosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  // Resize handlers
  const handleResizeMouseDown = useCallback((side: 'left' | 'right' | 'top' | 'bottom') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(side);
    resizeStartRef.current = {
      x: e.clientX, y: e.clientY,
      width, height: verticalHeight,
      posX: position.x, posY: position.y,
    };
  }, [width, verticalHeight, position.x, position.y]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    if (isResizing === 'top' || isResizing === 'bottom') {
      const delta = e.clientY - resizeStartRef.current.y;
      // Overhead: marginTop (1.5rem=24px) + padding (2×1rem=32px) + margin = ~72px
      const overhead = 72;
      if (isResizing === 'bottom') {
        // Bottom handle: expand downward — increase height AND shift position.y down
        // Constraint: new y = startY + heightChange ≤ 0 (can't go below map bottom)
        // So maxHeight = startHeight - startY (startY is ≤ 0)
        const maxH = containerBounds
          ? Math.min(MAX_VERTICAL_HEIGHT, containerBounds.height - overhead, resizeStartRef.current.height - resizeStartRef.current.posY)
          : MAX_VERTICAL_HEIGHT;
        const newHeight = Math.max(MIN_VERTICAL_HEIGHT, Math.min(maxH, resizeStartRef.current.height + delta));
        const heightChange = newHeight - resizeStartRef.current.height;
        setVerticalHeight(newHeight);
        setPosition(prev => ({ ...prev, y: resizeStartRef.current.posY + heightChange }));
      } else {
        // Top handle: expand upward — panel top can't exceed container top
        // panelFullHeight ≈ verticalHeight + overhead
        // Top edge: containerHeight + posY - panelFullHeight ≥ 0
        // So maxVerticalHeight = containerHeight + posY - overhead
        const maxH = containerBounds
          ? Math.min(MAX_VERTICAL_HEIGHT, containerBounds.height + resizeStartRef.current.posY - overhead)
          : MAX_VERTICAL_HEIGHT;
        setVerticalHeight(Math.max(MIN_VERTICAL_HEIGHT, Math.min(maxH, resizeStartRef.current.height - delta)));
      }
      return;
    }

    const delta = e.clientX - resizeStartRef.current.x;
    // Bound by the space actually available, not the absolute MAX_WIDTH, so the
    // panel can't be grown out past the edge of the map.
    const sign = isResizing === 'right' ? 1 : -1;
    const newWidth = Math.max(MIN_WIDTH, Math.min(maxUsableWidth, resizeStartRef.current.width + sign * delta));
    const widthDelta = newWidth - resizeStartRef.current.width;
    setWidth(newWidth);
    // Half the growth keeps the dragged edge anchored (the panel is centred),
    // then clamp so resizing can't shove it off-screen the way dragging can't.
    setPosition(prev => ({
      ...prev,
      x: clampPosition(resizeStartRef.current.posX + sign * (widthDelta / 2), prev.y).x,
    }));
  }, [isResizing, maxUsableWidth, clampPosition]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleResizeMove, handleMouseUp]);

  // ── Toggle button (shared between both layouts) ───────────────────────

  const orientationButton = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setIsVertical(prev => !prev);
      }}
      onMouseDown={(e) => e.stopPropagation()}
      title={isVertical ? 'Switch to horizontal slider' : 'Switch to vertical slider'}
      style={{
        width: '24px',
        height: '24px',
        padding: 0,
        borderRadius: '0.25rem',
        border: 'none',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.7,
        transition: 'opacity 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; }}
    >
      {/* Orientation icon: shows the layout you'd switch TO */}
      {isVertical ? <MoveHorizontal size={16} strokeWidth={2} /> : <MoveVertical size={16} strokeWidth={2} />}
    </button>
  );

  // ── Season selector (shared between layouts) ──────────────────────────

  const seasonSelector = seasonOptions.length > 0 ? (
    <div
      ref={seasonSelRef}
      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}
    >
      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        Season:
      </span>
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="season-selector"
          onClick={(e) => { e.stopPropagation(); setSeasonOpen(prev => !prev); }}
          onMouseDown={(e) => e.stopPropagation()}
          title="Zoom the timeline to a season (tip: right-clicking the timeline zooms to the season under the cursor)"
          style={{
            height: '32px',
            boxSizing: 'border-box',
            padding: '0 0.5rem',
            borderRadius: '0.375rem',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.25rem',
            minWidth: '3.5rem',
          }}
        >
          {seasonZoom && seasonZoom.kind !== 'event' && seasonZoom.kind !== 'wheel' ? seasonZoom.label : 'All'}
          <ChevronDown size={12} strokeWidth={2.5} />
        </button>
        {seasonOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '0.25rem',
              background: 'var(--bg-card-solid)',
              border: '1px solid var(--border-color)',
              borderRadius: '0.375rem',
              overflowY: 'auto',
              maxHeight: '240px',
              zIndex: 50,
              minWidth: '4.5rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}
          >
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleSeasonSelect(null); }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.375rem 0.625rem',
                border: 'none',
                background: !seasonZoom || seasonZoom.kind === 'event' || seasonZoom.kind === 'wheel' ? 'var(--accent-primary)' : 'var(--bg-card-solid)',
                color: !seasonZoom || seasonZoom.kind === 'event' || seasonZoom.kind === 'wheel' ? 'var(--text-on-accent)' : 'var(--text-primary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              All
            </button>
            {seasonOptions.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSeasonSelect(p); }}
                onMouseDown={(e) => e.stopPropagation()}
                title={`${p.start.toLocaleDateString()} – ${p.end.toLocaleDateString()}`}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '0.375rem 0.625rem',
                  border: 'none',
                  background: seasonZoom?.label === p.label ? 'var(--accent-primary)' : 'var(--bg-card-solid)',
                  color: seasonZoom?.label === p.label ? 'var(--text-on-accent)' : 'var(--text-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  ) : null;

  // ── Top-right controls (shared) ───────────────────────────────────────

  const topRightControls = (
    <div style={{
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
      // Rendered before HistoryTimeline, so without an explicit z-index the
      // timeline's tick-label row paints over these buttons and swallows their
      // clicks — the lower half of each 24px button became unclickable.
      zIndex: 2,
    }}>
      {isLoading ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
        }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              border: '2px solid var(--border-color)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          Loading...
        </div>
      ) : (loadProgress !== undefined && loadProgress < 1) ? (
        // Background gap-filling still running — show unobtrusive coverage %
        <div
          data-testid="history-load-progress"
          title="Timeline events loading in the background — scrubbing works everywhere, already-loaded ranges respond instantly"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            whiteSpace: 'nowrap',
          }}
        >
          <div
            style={{
              width: '10px',
              height: '10px',
              border: '2px solid var(--border-color)',
              borderTopColor: 'var(--accent-primary)',
              borderRadius: '50%',
              animation: 'spin 1.2s linear infinite',
            }}
          />
          {Math.round(loadProgress * 100)}% loaded
        </div>
      ) : null}
      {conflictBounds && onConflictFocusToggle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onConflictFocusToggle();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          title={isConflictFocused ? "Show full timeline" : "Focus on conflict"}
          style={{
            height: '22px',
            padding: '0 0.4rem',
            borderRadius: '0.25rem',
            border: `1px solid ${isConflictFocused ? 'var(--accent-primary)' : 'var(--border-color)'}`,
            background: isConflictFocused ? 'var(--accent-primary)' : 'transparent',
            color: isConflictFocused ? '#fff' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            fontSize: '0.65rem',
            fontWeight: 600,
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <Crosshair size={12} strokeWidth={2.5} />
          Conflict
        </button>
      )}
      {orientationButton}
      {onRefresh && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          disabled={isLoading}
          title="Refresh history data"
          style={{
            width: '24px',
            height: '24px',
            padding: 0,
            borderRadius: '0.25rem',
            border: 'none',
            background: 'transparent',
            color: 'var(--text-primary)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isLoading ? 0.4 : 0.7,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!isLoading) e.currentTarget.style.opacity = '1';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = isLoading ? '0.4' : '0.7';
          }}
        >
          <RefreshCw size={16} strokeWidth={2} />
        </button>
      )}
    </div>
  );

  // ── Playback + date controls (shared) ─────────────────────────────────

  const controlsSection = (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      marginTop: '0.75rem',
      gap: '0.5rem',
    }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: showSpeedInPlayback ? 'space-between' : 'center',
        alignItems: 'center',
        gap: '0.5rem',
        width: '100%',
      }}>
        <HistoryPlayback
          isPlaying={isPlaying}
          speed={speed}
          onPlayPause={onPlayPause}
          onSpeedChange={onSpeedChange}
          onStepForward={onStepForward}
          onStepBackward={onStepBackward}
          onJumpToStart={onJumpToStart}
          onJumpToEnd={onJumpToEnd}
          canStepForward={canStepForward}
          canStepBackward={canStepBackward}
          hideSpeed={!showSpeedInPlayback}
        />
        {showSpeedInPlayback && seasonSelector}
        {showSpeedInPlayback && (
          <HistoryDatePicker
            current={current}
            earliest={earliest}
            latest={latest}
            onJump={onJump}
          />
        )}
      </div>

      {!showSpeedInPlayback && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
        }}>
          <div
            ref={speedRef}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              flexShrink: 0,
            }}
          >
            <span style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
            }}>
              Speed:
            </span>
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setSpeedOpen(prev => !prev); }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  height: '32px',
                  boxSizing: 'border-box',
                  padding: '0 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.25rem',
                  minWidth: '3.5rem',
                }}
              >
                {speedLabel(speed)}
                <ChevronDown size={12} strokeWidth={2.5} />
              </button>
              {speedOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginBottom: '0.25rem',
                    background: 'var(--bg-card-solid)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.375rem',
                    overflow: 'hidden',
                    zIndex: 50,
                    minWidth: '3.5rem',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  {ALL_SPEED_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSpeedChange(s);
                        setSpeedOpen(false);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '0.375rem 0.625rem',
                        border: 'none',
                        background: s === speed ? 'var(--accent-primary)' : 'var(--bg-card-solid)',
                        color: s === speed ? 'var(--text-on-accent)' : 'var(--text-primary)',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {speedLabel(s)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          {seasonSelector}
          <HistoryDatePicker
            current={current}
            earliest={earliest}
            latest={latest}
            onJump={onJump}
          />
        </div>
      )}
    </div>
  );

  return (
    <div
      ref={containerRef}
      data-testid="history-controls-panel"
      data-tour="history-timeline"
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        background: 'var(--bg-card-solid)',
        borderRadius: '0.75rem',
        border: '1px solid var(--border-color)',
        padding: '1rem',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        width: `${panelWidth}px`,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : isResizing === 'top' || isResizing === 'bottom' ? 'ns-resize' : isResizing ? 'ew-resize' : 'grab',
        userSelect: 'none',
        overflow: 'visible',
      }}
    >
      {isVertical ? (
        <>
          {/* Vertical resize handles (top/bottom) — same visible-pill +
              extended-hitbox treatment as the horizontal edges */}
          <div
            onMouseDown={handleResizeMouseDown('top')}
            style={{
              position: 'absolute',
              top: '-10px',
              left: 0,
              right: 0,
              height: '20px',
              cursor: 'ns-resize',
              background: 'transparent',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ ...resizePillStyle, width: '36px', height: '5px' }} />
          </div>
          <div
            onMouseDown={handleResizeMouseDown('bottom')}
            style={{
              position: 'absolute',
              bottom: '-10px',
              left: 0,
              right: 0,
              height: '20px',
              cursor: 'ns-resize',
              background: 'transparent',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ ...resizePillStyle, width: '36px', height: '5px' }} />
          </div>

          {topRightControls}

          {/* ── Vertical: bar left, 7-row grid right ────────────────────── */}
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'stretch',
            marginTop: '1.5rem',
            height: `${verticalHeight}px`,
          }}>
            {/* Left: vertical timeline bar */}
            <div style={{ height: '100%', flexShrink: 0 }}>
              <HistoryTimeline
                earliest={earliest}
                latest={latest}
                current={current}
                onChange={onTimeChange}
                gaps={gaps}
                vertical
                hideCurrentTime
                seasons={seasons}
                seasonZoom={seasonZoom}
                onSeasonZoomChange={setSeasonZoom}
                eventMarkers={eventMarkers}
                allianceSpans={allianceSpans}
              />
            </div>

            {/* Right: controls grouped in center */}
            <div style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}>
              {/* Row 1: Current time */}
              <div data-testid="timeline-current-time" style={{
                fontSize: '0.8rem',
                fontWeight: '500',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {currentDisplay.dateTimeLabel}
              </div>

              {/* Row 2: Jump to start / jump to end */}
              <div style={{ display: 'flex', gap: '0.375rem', width: '100%', maxWidth: '10rem' }}>
                <button
                  type="button"
                  onClick={onJumpToStart}
                  disabled={!canStepBackward}
                  title="Jump to start"
                  style={{ ...vBtnStyle(canStepBackward), flex: 1 }}
                >
                  <SkipBack size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={onJumpToEnd}
                  disabled={!canStepForward}
                  title="Jump to end"
                  style={{ ...vBtnStyle(canStepForward), flex: 1 }}
                >
                  <SkipForward size={16} strokeWidth={2} />
                </button>
              </div>

              {/* Row 3: Step back / Play / Step forward */}
              <div style={{ display: 'flex', gap: '0.375rem', width: '100%', maxWidth: '10rem' }}>
                <button
                  type="button"
                  onClick={onStepBackward}
                  disabled={!canStepBackward}
                  title="Previous snapshot"
                  style={{ ...vBtnStyle(canStepBackward), flex: 1 }}
                >
                  <ChevronLeft size={16} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={onPlayPause}
                  title={isPlaying ? 'Pause' : 'Play'}
                  style={{
                    ...vBtnStyle(true),
                    flex: 1,
                    padding: '0.5rem',
                    background: isPlaying ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                    color: isPlaying ? 'var(--text-on-accent)' : 'var(--text-primary)',
                  }}
                >
                  {isPlaying ? (
                    <Pause size={16} fill="currentColor" strokeWidth={0} />
                  ) : (
                    <Play size={16} fill="currentColor" strokeWidth={0} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onStepForward}
                  disabled={!canStepForward}
                  title="Next snapshot"
                  style={{ ...vBtnStyle(canStepForward), flex: 1 }}
                >
                  <ChevronRight size={16} strokeWidth={2} />
                </button>
              </div>

              {/* Row 4: Speed selector */}
              <div
                ref={speedRef}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem', width: '100%', maxWidth: '10rem' }}
              >
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Speed:
                </span>
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setSpeedOpen(prev => !prev); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      ...vBtnStyle(true),
                      fontSize: '0.8rem',
                      gap: '0.25rem',
                      minWidth: '3.5rem',
                    }}
                  >
                    {speedLabel(speed)}
                    <ChevronDown size={12} strokeWidth={2.5} />
                  </button>
                  {speedOpen && (
                    <div style={{
                      position: 'absolute',
                      bottom: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginBottom: '0.25rem',
                      background: 'var(--bg-card-solid)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.375rem',
                      overflow: 'hidden',
                      zIndex: 50,
                      minWidth: '3.5rem',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    }}>
                      {ALL_SPEED_OPTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSpeedChange(s);
                            setSpeedOpen(false);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            display: 'block',
                            width: '100%',
                            padding: '0.375rem 0.625rem',
                            border: 'none',
                            background: s === speed ? 'var(--accent-primary)' : 'var(--bg-card-solid)',
                            color: s === speed ? 'var(--text-on-accent)' : 'var(--text-primary)',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {speedLabel(s)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Row 4b: Season selector */}
              {seasonSelector}

              {/* Row 5: Date picker */}
              <PickerField
                type="date"
                defaultValue={currentDisplay.dateValue}
                min={earliest.toISOString().split('T')[0]}
                max={latest.toISOString().split('T')[0]}
                onChange={(val) => {
                  if (val) {
                    const d = new Date(val + 'T' + current.toTimeString().slice(0, 5));
                    if (!isNaN(d.getTime())) onJump(d);
                  }
                }}
                width="100%"
                maxWidth="10rem"
              />

              {/* Row 6: Time picker */}
              <PickerField
                type="time"
                defaultValue={currentDisplay.timeValue}
                onChange={(val) => {
                  if (val) {
                    const [h, m] = val.split(':').map(Number);
                    const d = new Date(current);
                    d.setHours(h || 0, m || 0, 0, 0);
                    if (!isNaN(d.getTime())) onJump(d);
                  }
                }}
                width="100%"
                maxWidth="10rem"
              />

              {/* Row 7: Jump button */}
              <button
                type="button"
                onClick={() => {
                  const dateInput = containerRef.current?.querySelector<HTMLInputElement>('input[type="date"]');
                  const timeInput = containerRef.current?.querySelector<HTMLInputElement>('input[type="time"]');
                  if (dateInput && timeInput) {
                    const [h, m] = (timeInput.value || '00:00').split(':').map(Number);
                    const d = new Date(dateInput.value + 'T00:00:00');
                    d.setHours(h || 0, m || 0, 0, 0);
                    if (!isNaN(d.getTime())) {
                      const clamped = Math.max(earliest.getTime(), Math.min(latest.getTime(), d.getTime()));
                      onJump(new Date(clamped));
                    }
                  }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  height: '32px',
                  boxSizing: 'border-box',
                  padding: '0 0.75rem',
                  borderRadius: '0.375rem',
                  border: 'none',
                  background: 'var(--accent-primary)',
                  color: 'var(--text-on-accent)',
                  fontSize: '0.8rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'opacity 0.15s ease',
                  width: '100%',
                  maxWidth: '10rem',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                Jump
              </button>
            </div>
          </div>

        </>
      ) : (
        /* ── Horizontal: resize handles, timeline, controls ─────────── */
        <>
          {/* Left/right resize: a visible pill straddling each edge, with a
              hitbox that extends well outside the panel (the old invisible
              8px inner strip was too narrow to find) */}
          <div
            data-testid="timeline-resize-left"
            onMouseDown={handleResizeMouseDown('left')}
            style={{
              position: 'absolute',
              left: '-14px',
              top: 0,
              bottom: 0,
              width: '28px',
              cursor: 'ew-resize',
              background: 'transparent',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={resizePillStyle} />
          </div>
          <div
            data-testid="timeline-resize-right"
            onMouseDown={handleResizeMouseDown('right')}
            style={{
              position: 'absolute',
              right: '-14px',
              top: 0,
              bottom: 0,
              width: '28px',
              cursor: 'ew-resize',
              background: 'transparent',
              zIndex: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={resizePillStyle} />
          </div>

          {topRightControls}

          <HistoryTimeline
            earliest={earliest}
            latest={latest}
            current={current}
            onChange={onTimeChange}
            gaps={gaps}
            seasons={seasons}
            seasonZoom={seasonZoom}
            onSeasonZoomChange={setSeasonZoom}
            eventMarkers={eventMarkers}
            allianceSpans={allianceSpans}
          />
          {controlsSection}
        </>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default memo(MapHistoryControls);
