"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import HistoryTimeline from "./HistoryTimeline";
import HistoryDatePicker from "./HistoryDatePicker";
import HistoryPlayback from "./HistoryPlayback";

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
  loadedRanges?: Array<[number, number]>; // [startMs, endMs][] — loaded event ranges
}

const SPEED_OPTIONS = [1, 2, 10, 50];
const FAST_SPEED = -1;

function speedLabel(s: number): string {
  return s === FAST_SPEED ? 'Fast' : `${s}x`;
}
const MIN_WIDTH = 280;
const MAX_WIDTH = 1800;
const VERTICAL_WIDTH = 248;
const DEFAULT_VERTICAL_HEIGHT = 350;
const MIN_VERTICAL_HEIGHT = 242;
const MAX_VERTICAL_HEIGHT = 1040;

function vBtnStyle(enabled: boolean): React.CSSProperties {
  return {
    padding: '0.5rem',
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

export default function MapHistoryControls({
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
  loadedRanges,
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
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 1200, height: DEFAULT_VERTICAL_HEIGHT, posX: 0, posY: 0 });

  const panelWidth = isVertical ? VERTICAL_WIDTH : width;

  // Layout breakpoints based on component widths (horizontal mode only)
  const showSpeedInPlayback = panelWidth >= 540;
  const stackDateRow = panelWidth < 420;

  // Clamp position to keep panel within container bounds
  const clampPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current || !containerBounds) return { x, y };
    const halfWidth = panelWidth / 2;
    const panelHeight = containerRef.current.offsetHeight;
    const maxX = containerBounds.width / 2 - halfWidth;
    const minX = -containerBounds.width / 2 + halfWidth;
    const maxY = 0;
    const minY = -(containerBounds.height - panelHeight - 16);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, [panelWidth, containerBounds]);

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
    if (isResizing === 'right') {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width + delta));
      const widthDelta = newWidth - resizeStartRef.current.width;
      const newPosX = resizeStartRef.current.posX + widthDelta / 2;
      setWidth(newWidth);
      setPosition(prev => ({ ...prev, x: newPosX }));
    } else {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width - delta));
      const widthDelta = newWidth - resizeStartRef.current.width;
      const newPosX = resizeStartRef.current.posX - widthDelta / 2;
      setWidth(newWidth);
      setPosition(prev => ({ ...prev, x: newPosX }));
    }
  }, [isResizing, containerBounds]);

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
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 0.15s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
    >
      {/* Orientation icon: horizontal bars ↔ vertical bars */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {isVertical ? (
          // Show horizontal icon (click to switch to horizontal)
          <>
            <line x1="4" y1="8" x2="20" y2="8" />
            <line x1="4" y1="16" x2="20" y2="16" />
            <polyline points="7,5 4,8 7,11" />
            <polyline points="17,13 20,16 17,19" />
          </>
        ) : (
          // Show vertical icon (click to switch to vertical)
          <>
            <line x1="8" y1="4" x2="8" y2="20" />
            <line x1="16" y1="4" x2="16" y2="20" />
            <polyline points="5,7 8,4 11,7" />
            <polyline points="13,17 16,20 19,17" />
          </>
        )}
      </svg>
    </button>
  );

  // ── Top-right controls (shared) ───────────────────────────────────────

  const topRightControls = (
    <div style={{
      position: 'absolute',
      top: '0.5rem',
      right: '0.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.25rem',
    }}>
      {isLoading && (
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
      )}
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
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="6" />
            <circle cx="12" cy="12" r="2" />
          </svg>
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
            color: 'var(--text-secondary)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: isLoading ? 0.5 : 1,
            transition: 'color 0.15s ease, opacity 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!isLoading) e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M21 21v-5h-5" />
          </svg>
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
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  minWidth: '3.5rem',
                }}
              >
                {speedLabel(speed)}
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="6,9 12,15 18,9" />
                </svg>
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
                  {[...SPEED_OPTIONS, FAST_SPEED].map((s) => (
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
          {/* Vertical resize handles (top/bottom) */}
          <div
            onMouseDown={handleResizeMouseDown('top')}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '8px',
              cursor: 'ns-resize',
              background: 'transparent',
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={handleResizeMouseDown('bottom')}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '8px',
              cursor: 'ns-resize',
              background: 'transparent',
              zIndex: 10,
            }}
          />

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
                loadedRanges={loadedRanges}
              />
            </div>

            {/* Right: controls grouped in center */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              paddingRight: '0.75rem',
            }}>
              {/* Row 1: Current time */}
              <div style={{
                fontSize: '0.8rem',
                fontWeight: '500',
                color: 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}>
                {current.toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="17,17 11,12 17,7" />
                    <line x1="7" y1="7" x2="7" y2="17" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={onJumpToEnd}
                  disabled={!canStepForward}
                  title="Jump to end"
                  style={{ ...vBtnStyle(canStepForward), flex: 1 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="7,17 13,12 7,7" />
                    <line x1="17" y1="7" x2="17" y2="17" />
                  </svg>
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
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15,17 9,12 15,7" />
                  </svg>
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
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5,3 19,12 5,21" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onStepForward}
                  disabled={!canStepForward}
                  title="Next snapshot"
                  style={{ ...vBtnStyle(canStepForward), flex: 1 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9,17 15,12 9,7" />
                  </svg>
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
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.8rem',
                      gap: '0.25rem',
                      minWidth: '3.5rem',
                    }}
                  >
                    {speedLabel(speed)}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
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
                      {[...SPEED_OPTIONS, FAST_SPEED].map((s) => (
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

              {/* Row 5: Date picker */}
              <input
                type="date"
                className="history-date-input"
                defaultValue={current.toISOString().split('T')[0]}
                min={earliest.toISOString().split('T')[0]}
                max={latest.toISOString().split('T')[0]}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const d = new Date(val + 'T' + current.toTimeString().slice(0, 5));
                    if (!isNaN(d.getTime())) onJump(d);
                  }
                }}
                style={{
                  padding: '0.375rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  colorScheme: 'dark light',
                  width: '100%',
                  maxWidth: '10rem',
                  boxSizing: 'border-box',
                }}
              />

              {/* Row 6: Time picker */}
              <input
                type="time"
                defaultValue={`${current.getHours().toString().padStart(2, '0')}:${current.getMinutes().toString().padStart(2, '0')}`}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    const [h, m] = val.split(':').map(Number);
                    const d = new Date(current);
                    d.setHours(h || 0, m || 0, 0, 0);
                    if (!isNaN(d.getTime())) onJump(d);
                  }
                }}
                style={{
                  padding: '0.375rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  outline: 'none',
                  colorScheme: 'dark light',
                  width: '100%',
                  maxWidth: '10rem',
                  boxSizing: 'border-box',
                }}
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
                  padding: '0.375rem 0.75rem',
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

          <style>{`
            .history-date-input::-webkit-calendar-picker-indicator {
              filter: var(--calendar-icon-filter, none);
              cursor: pointer;
            }
            [data-theme="dark"] .history-date-input::-webkit-calendar-picker-indicator {
              filter: invert(1);
            }
          `}</style>
        </>
      ) : (
        /* ── Horizontal: resize handles, timeline, controls ─────────── */
        <>
          <div
            onMouseDown={handleResizeMouseDown('left')}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: '8px',
              cursor: 'ew-resize',
              background: 'transparent',
              zIndex: 10,
            }}
          />
          <div
            onMouseDown={handleResizeMouseDown('right')}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 0,
              width: '8px',
              cursor: 'ew-resize',
              background: 'transparent',
              zIndex: 10,
            }}
          />

          {topRightControls}

          <HistoryTimeline
            earliest={earliest}
            latest={latest}
            current={current}
            onChange={onTimeChange}
            gaps={gaps}
            loadedRanges={loadedRanges}
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
