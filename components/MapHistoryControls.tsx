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
  onGoToFirst: () => void;
  onGoToLatest: () => void;
  canStepForward: boolean;
  canStepBackward: boolean;
  loadedStart?: Date;
  loadedEnd?: Date;
  isLoading?: boolean;
  snapshots?: Date[];
  onRefresh?: () => void;
  containerBounds?: { width: number; height: number };
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;

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
  onGoToFirst,
  onGoToLatest,
  canStepForward,
  canStepBackward,
  loadedStart,
  loadedEnd,
  isLoading,
  snapshots,
  onRefresh,
  containerBounds,
}: MapHistoryControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | false>(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(450);
  const [isInitialized, setIsInitialized] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStartRef = useRef({ x: 0, width: 450, posX: 0 });

  // Layout breakpoints based on component widths:
  // - Playback buttons (5 buttons): ~180px
  // - Speed selector (label + dropdown): ~90px
  // - Date input: ~130px
  // - Jump button: ~55px
  // - Gaps between sections: ~30px
  //
  // Full row (playback+speed + date+jump): 180+90 + 130+55 + 30 = ~485px minimum
  // Two rows (playback | speed+date+jump): needs ~290px for bottom row
  // Three rows (playback | speed | date+jump): needs ~185px for date+jump
  const showSpeedInPlayback = width >= 520; // Speed in same row as playback buttons
  const stackDateRow = width < 380; // Date+Jump gets its own row below speed

  // Clamp position to keep panel within container bounds
  const clampPosition = useCallback((x: number, y: number) => {
    if (!containerRef.current || !containerBounds) return { x, y };
    const halfWidth = width / 2;
    const panelHeight = containerRef.current.offsetHeight;
    // Panel is centered at bottom, so x=0 means centered
    const maxX = containerBounds.width / 2 - halfWidth;
    const minX = -containerBounds.width / 2 + halfWidth;
    const maxY = 0; // Can't go below starting position (bottom)
    const minY = -(containerBounds.height - panelHeight - 16); // 16px = 1rem bottom margin
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, [width, containerBounds]);

  // Load cached position and width on mount
  useEffect(() => {
    const cachedPos = localStorage.getItem('historyControlsPosition');
    const cachedWidth = localStorage.getItem('historyControlsWidth');
    if (cachedPos) {
      try {
        setPosition(JSON.parse(cachedPos));
      } catch { /* ignore */ }
    }
    if (cachedWidth) {
      const w = parseInt(cachedWidth, 10);
      if (!isNaN(w)) setWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, w)));
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

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drag if clicking on the panel itself, not on interactive elements
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

    // Also skip if clicking on the timeline track (has its own drag behavior)
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

  // Resize handlers - support both left and right edges
  const handleResizeMouseDown = useCallback((side: 'left' | 'right') => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(side);
    resizeStartRef.current = { x: e.clientX, width, posX: position.x };
  }, [width, position.x]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const delta = e.clientX - resizeStartRef.current.x;

    if (isResizing === 'right') {
      // Right edge: just change width
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width + delta));
      setWidth(newWidth);
    } else {
      // Left edge: change width and position (to keep right edge stationary)
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, resizeStartRef.current.width - delta));
      const widthDelta = newWidth - resizeStartRef.current.width;
      // Since panel is centered, moving left edge means shifting position left by half the width change
      const newPosX = resizeStartRef.current.posX - widthDelta / 2;
      setWidth(newWidth);
      setPosition(prev => ({ ...prev, x: newPosX }));
    }
  }, [isResizing]);

  // Window event listeners for dragging
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

  // Window event listeners for resizing
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
        width: `${width}px`,
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : isResizing ? 'ew-resize' : 'grab',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    >
      {/* Left edge resize handle */}
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
      {/* Right edge resize handle */}
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
      {/* Top right controls - Refresh button and loading indicator */}
      <div style={{
        position: 'absolute',
        top: '0.5rem',
        right: '0.5rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}>
        {/* Loading indicator */}
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
        {/* Refresh button */}
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

      {/* Timeline */}
      <HistoryTimeline
        earliest={earliest}
        latest={latest}
        current={current}
        onChange={onTimeChange}
        loadedStart={loadedStart}
        loadedEnd={loadedEnd}
        snapshots={snapshots}
      />

      {/* Controls row - responsive layout */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: '0.75rem',
        gap: '0.75rem',
      }}>
        {/* Row 1: Playback controls (with or without speed based on width) */}
        <div style={{
          display: 'flex',
          justifyContent: showSpeedInPlayback ? 'space-between' : 'center',
          alignItems: 'center',
          width: '100%',
        }}>
          <HistoryPlayback
            isPlaying={isPlaying}
            speed={speed}
            onPlayPause={onPlayPause}
            onSpeedChange={onSpeedChange}
            onStepForward={onStepForward}
            onStepBackward={onStepBackward}
            onGoToFirst={onGoToFirst}
            onGoToLatest={onGoToLatest}
            canStepForward={canStepForward}
            canStepBackward={canStepBackward}
            hideSpeed={!showSpeedInPlayback}
          />
          {/* Date picker in same row when wide enough */}
          {showSpeedInPlayback && (
            <HistoryDatePicker
              current={current}
              earliest={earliest}
              latest={latest}
              onJump={onJump}
            />
          )}
        </div>

        {/* Row 2: Speed + Date (when not wide enough for full row) */}
        {!showSpeedInPlayback && (
          <div style={{
            display: 'flex',
            flexDirection: stackDateRow ? 'column' : 'row',
            gap: '0.75rem',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
          }}>
            {/* Speed selector */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}>
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-secondary)',
              }}>
                Speed:
              </span>
              <select
                value={speed}
                onChange={(e) => onSpeedChange(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  appearance: 'auto',
                  WebkitAppearance: 'menulist',
                }}
              >
                {SPEED_OPTIONS.map((s) => (
                  <option key={s} value={s} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                    {s}x
                  </option>
                ))}
              </select>
            </div>
            {/* Date picker */}
            <HistoryDatePicker
              current={current}
              earliest={earliest}
              latest={latest}
              onJump={onJump}
            />
          </div>
        )}
      </div>

      {/* Keyframes for loading spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
