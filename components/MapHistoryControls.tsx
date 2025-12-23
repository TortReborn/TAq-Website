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
  onGoToFirst,
  onGoToLatest,
  canStepForward,
  canStepBackward,
  loadedStart,
  loadedEnd,
  isLoading,
  snapshots,
  onRefresh,
}: MapHistoryControlsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

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

    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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
        minWidth: '400px',
        maxWidth: '600px',
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
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

      {/* Controls row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '0.75rem',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        {/* Playback controls */}
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
        />

        {/* Date picker */}
        <HistoryDatePicker
          current={current}
          earliest={earliest}
          latest={latest}
          onJump={onJump}
        />
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
