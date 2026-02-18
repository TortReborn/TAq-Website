"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  snapshots?: Date[]; // Available snapshot timestamps to snap to
}

export default function HistoryTimeline({
  earliest,
  latest,
  current,
  onChange,
  snapshots,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  // Calculate the total range in milliseconds
  const totalRange = latest.getTime() - earliest.getTime();

  // Calculate the position as a percentage
  const currentPercent = useMemo(() => {
    if (totalRange === 0) return 0;
    return ((current.getTime() - earliest.getTime()) / totalRange) * 100;
  }, [current, earliest, totalRange]);

  // Helper to convert percentage to CSS position that keeps thumb within bounds
  // At 0%: 12px from left, at 100%: 12px from right (for 24px thumb)
  const percentToPosition = (percent: number) => {
    const offset = 12 - 0.24 * percent;
    return `calc(${percent}% + ${offset}px)`;
  };

  // Convert a percentage position to a date
  const percentToDate = useCallback((percent: number): Date => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const timestamp = earliest.getTime() + (clampedPercent / 100) * totalRange;
    return new Date(timestamp);
  }, [earliest, totalRange]);

  // Pre-compute sorted ms values for binary search snapping
  const sortedSnapshotMs = useMemo(() => {
    if (!snapshots || snapshots.length === 0) return null;
    return snapshots.map(s => s.getTime());
  }, [snapshots]);

  // Find the nearest snapshot using binary search — O(log n).
  // Returns the raw date if no snapshots are loaded or if the nearest
  // snapshot is too far away (allows dragging beyond the loaded range).
  const findNearestSnapshot = useCallback((targetDate: Date): Date => {
    if (!sortedSnapshotMs || sortedSnapshotMs.length === 0 || !snapshots) {
      return targetDate;
    }

    const targetMs = targetDate.getTime();
    let lo = 0, hi = sortedSnapshotMs.length - 1;

    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sortedSnapshotMs[mid] < targetMs) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }

    if (lo === 0) {
      // If the nearest snapshot is far from the target, don't snap
      if (Math.abs(sortedSnapshotMs[0] - targetMs) > totalRange * 0.02) {
        return targetDate;
      }
      return snapshots[0];
    }

    const diffLo = Math.abs(sortedSnapshotMs[lo] - targetMs);
    const diffPrev = Math.abs(sortedSnapshotMs[lo - 1] - targetMs);
    const nearest = diffPrev <= diffLo ? lo - 1 : lo;
    const nearestDiff = Math.min(diffLo, diffPrev);

    // Don't snap if the nearest snapshot is more than 2% of the total range away
    if (nearestDiff > totalRange * 0.02) {
      return targetDate;
    }

    return snapshots[nearest];
  }, [sortedSnapshotMs, snapshots, totalRange]);

  // Throttle ref for drag interactions (16ms = ~60fps)
  const lastDragUpdateRef = useRef<number>(0);

  // Handle click/drag on the track
  // Account for 12px padding on each side where the thumb center lives (for 24px thumb)
  const handleTrackInteraction = useCallback((clientX: number, force?: boolean) => {
    // Throttle to ~60fps during drag
    if (!force) {
      const now = performance.now();
      if (now - lastDragUpdateRef.current < 16) return;
      lastDragUpdateRef.current = now;
    }

    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    const padding = 12;
    const usableWidth = rect.width - padding * 2;

    // Map click position to percentage, accounting for padding
    const adjustedX = Math.max(0, Math.min(usableWidth, x - padding));
    const percent = usableWidth > 0 ? (adjustedX / usableWidth) * 100 : 0;

    const rawDate = percentToDate(percent);
    // Snap to nearest snapshot if available
    const newDate = findNearestSnapshot(rawDate);
    onChange(newDate);
  }, [percentToDate, findNearestSnapshot, onChange]);

  // Hover tracking for tooltip
  const handleTrackHover = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track || isDragging) return;
    const rect = track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = 12;
    const usableWidth = rect.width - padding * 2;
    const adjustedX = Math.max(0, Math.min(usableWidth, x - padding));
    const percent = usableWidth > 0 ? (adjustedX / usableWidth) * 100 : 0;
    setHoverPercent(percent);
    setHoverX(x);
  }, [isDragging]);

  const handleTrackLeave = useCallback(() => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  }, [isDragging]);

  // Compute hovered date from percent
  const hoverDate = useMemo(() => {
    if (hoverPercent === null) return null;
    return percentToDate(hoverPercent);
  }, [hoverPercent, percentToDate]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setHoverPercent(null);
    handleTrackInteraction(e.clientX, true); // force: skip throttle on initial click
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleTrackInteraction(e.clientX);
    }
  }, [isDragging, handleTrackInteraction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setHoverPercent(null);
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
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          height: '24px',
          background: 'var(--bg-tertiary)',
          borderRadius: '12px',
          cursor: 'pointer',
          overflow: 'visible',
        }}
      >
        {/* Hover tooltip */}
        {hoverDate && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: `${hoverX}px`,
            transform: 'translateX(-50%)',
            marginBottom: '6px',
            padding: '0.25rem 0.5rem',
            borderRadius: '0.375rem',
            background: 'var(--bg-card-solid, var(--bg-card))',
            border: '1px solid var(--border-color)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            fontSize: '0.75rem',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            zIndex: 20,
          }}>
            {hoverDate.toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>
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
            borderRadius: '12px 0 0 12px',
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
            border: '3px solid #fff',
            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
            transition: isDragging ? 'none' : 'left 0.1s ease',
          }}
        />
      </div>
    </div>
  );
}
