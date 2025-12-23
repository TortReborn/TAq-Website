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
      {/* Loading indicator */}
      {isLoading && (
        <div style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
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
