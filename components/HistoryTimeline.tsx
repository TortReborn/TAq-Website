"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  loadedStart?: Date;
  loadedEnd?: Date;
  snapshots?: Date[]; // Available snapshot timestamps to snap to
}

export default function HistoryTimeline({
  earliest,
  latest,
  current,
  onChange,
  loadedStart,
  loadedEnd,
  snapshots,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Calculate the total range in milliseconds
  const totalRange = latest.getTime() - earliest.getTime();

  // Calculate the position as a percentage
  const currentPercent = useMemo(() => {
    if (totalRange === 0) return 0;
    return ((current.getTime() - earliest.getTime()) / totalRange) * 100;
  }, [current, earliest, totalRange]);

  // Calculate loaded range percentages
  const loadedPercents = useMemo(() => {
    if (!loadedStart || !loadedEnd || totalRange === 0) return null;
    const startPercent = ((loadedStart.getTime() - earliest.getTime()) / totalRange) * 100;
    const endPercent = ((loadedEnd.getTime() - earliest.getTime()) / totalRange) * 100;
    return { start: Math.max(0, startPercent), end: Math.min(100, endPercent) };
  }, [loadedStart, loadedEnd, earliest, totalRange]);

  // Helper to convert percentage to CSS position that keeps thumb within bounds
  // At 0%: 8px from left, at 100%: 8px from right (for 16px thumb)
  const percentToPosition = (percent: number) => {
    const offset = 8 - 0.16 * percent;
    return `calc(${percent}% + ${offset}px)`;
  };

  // Convert a percentage position to a date
  const percentToDate = useCallback((percent: number): Date => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const timestamp = earliest.getTime() + (clampedPercent / 100) * totalRange;
    return new Date(timestamp);
  }, [earliest, totalRange]);

  // Find the nearest snapshot to a given date
  const findNearestSnapshot = useCallback((targetDate: Date): Date => {
    if (!snapshots || snapshots.length === 0) {
      return targetDate;
    }

    let nearest = snapshots[0];
    let nearestDiff = Math.abs(nearest.getTime() - targetDate.getTime());

    for (const snapshot of snapshots) {
      const diff = Math.abs(snapshot.getTime() - targetDate.getTime());
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = snapshot;
      }
    }

    return nearest;
  }, [snapshots]);

  // Handle click/drag on the track
  // Account for 8px padding on each side where the thumb center lives
  const handleTrackInteraction = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = 8;
    const usableWidth = rect.width - padding * 2;

    // Map click position to percentage, accounting for padding
    const adjustedX = Math.max(0, Math.min(usableWidth, x - padding));
    const percent = usableWidth > 0 ? (adjustedX / usableWidth) * 100 : 0;

    const rawDate = percentToDate(percent);
    // Snap to nearest snapshot if available
    const newDate = findNearestSnapshot(rawDate);
    onChange(newDate);
  }, [percentToDate, findNearestSnapshot, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    handleTrackInteraction(e.clientX);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleTrackInteraction(e.clientX);
    }
  }, [isDragging, handleTrackInteraction]);

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

  // Format date for display
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div style={{ width: '100%', padding: '0.25rem 0' }}>
      {/* Current time display - above the slider */}
      <div style={{
        textAlign: 'center',
        marginBottom: '0.25rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: 'var(--text-primary)',
      }}>
        {current.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </div>

      {/* Date labels */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.25rem',
        fontSize: '0.75rem',
        color: 'var(--text-secondary)',
      }}>
        <span>{formatDate(earliest)}</span>
        <span>{formatDate(latest)}</span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        data-timeline-track
        onMouseDown={handleMouseDown}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          height: '24px',
          background: 'var(--bg-tertiary)',
          borderRadius: '12px',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {/* Loaded range indicator */}
        {loadedPercents && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${loadedPercents.start}%`,
              right: `${100 - loadedPercents.end}%`,
              background: 'rgba(59, 130, 246, 0.2)',
            }}
          />
        )}

        {/* Progress fill - ends at thumb center */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: percentToPosition(currentPercent),
            background: 'var(--accent-primary)',
            opacity: 0.3,
          }}
        />

        {/* Thumb - constrained to stay within track bounds */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: percentToPosition(currentPercent),
            transform: 'translate(-50%, -50%)',
            width: '24px',
            height: '24px',
            background: 'var(--accent-primary)',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            transition: isDragging ? 'none' : 'left 0.1s ease',
          }}
        />
      </div>
    </div>
  );
}
