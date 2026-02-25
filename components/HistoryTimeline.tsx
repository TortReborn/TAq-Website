"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  snapshots?: Date[]; // Available snapshot timestamps to snap to
  gaps?: Array<{ start: Date; end: Date }>; // Time ranges with no data
  vertical?: boolean;
  hideCurrentTime?: boolean; // Hide the current time display (shown externally)
}

export default function HistoryTimeline({
  earliest,
  latest,
  current,
  onChange,
  snapshots,
  gaps,
  vertical,
  hideCurrentTime,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0); // X position (horizontal) or Y position (vertical)

  // Calculate the total range in milliseconds
  const totalRange = latest.getTime() - earliest.getTime();

  // Precompute gap positions as percentages of the total range
  const gapRegions = useMemo(() => {
    if (!gaps || gaps.length === 0 || totalRange === 0) return [];
    return gaps.map(gap => {
      const startPct = Math.max(0, ((gap.start.getTime() - earliest.getTime()) / totalRange) * 100);
      const endPct = Math.min(100, ((gap.end.getTime() - earliest.getTime()) / totalRange) * 100);
      return { startPct, endPct };
    });
  }, [gaps, earliest, totalRange]);

  // Calculate the position as a percentage
  const currentPercent = useMemo(() => {
    if (totalRange === 0) return 0;
    return ((current.getTime() - earliest.getTime()) / totalRange) * 100;
  }, [current, earliest, totalRange]);

  // Helper to convert percentage to CSS position that keeps thumb within bounds
  // At 0%: 12px from start, at 100%: 12px from end (for 24px thumb)
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
      if (Math.abs(sortedSnapshotMs[0] - targetMs) > totalRange * 0.02) {
        return targetDate;
      }
      return snapshots[0];
    }

    const diffLo = Math.abs(sortedSnapshotMs[lo] - targetMs);
    const diffPrev = Math.abs(sortedSnapshotMs[lo - 1] - targetMs);
    const nearest = diffPrev <= diffLo ? lo - 1 : lo;
    const nearestDiff = Math.min(diffLo, diffPrev);

    if (nearestDiff > totalRange * 0.02) {
      return targetDate;
    }

    return snapshots[nearest];
  }, [sortedSnapshotMs, snapshots, totalRange]);

  // Throttle ref for drag interactions (16ms = ~60fps)
  const lastDragUpdateRef = useRef<number>(0);

  // Check if a percentage falls within a gap region
  const isInGap = useCallback((percent: number): boolean => {
    for (const gap of gapRegions) {
      if (percent >= gap.startPct && percent <= gap.endPct) return true;
    }
    return false;
  }, [gapRegions]);

  // Handle click/drag on the track — works for both horizontal and vertical
  const handleTrackInteraction = useCallback((clientX: number, clientY: number, force?: boolean) => {
    if (!force) {
      const now = performance.now();
      if (now - lastDragUpdateRef.current < 16) return;
      lastDragUpdateRef.current = now;
    }

    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const padding = 12;

    const pos = vertical ? clientY - rect.top : clientX - rect.left;
    const trackSize = vertical ? rect.height : rect.width;
    const usableSize = trackSize - padding * 2;
    const adjustedPos = Math.max(0, Math.min(usableSize, pos - padding));
    const percent = usableSize > 0 ? (adjustedPos / usableSize) * 100 : 0;

    if (isInGap(percent)) return;

    const rawDate = percentToDate(percent);
    const newDate = findNearestSnapshot(rawDate);
    onChange(newDate);
  }, [vertical, percentToDate, findNearestSnapshot, onChange, isInGap]);

  // Hover tracking for tooltip
  const handleTrackHover = useCallback((e: React.MouseEvent) => {
    const track = trackRef.current;
    if (!track || isDragging) return;
    const rect = track.getBoundingClientRect();
    const padding = 12;

    const pos = vertical ? e.clientY - rect.top : e.clientX - rect.left;
    const trackSize = vertical ? rect.height : rect.width;
    const usableSize = trackSize - padding * 2;
    const adjustedPos = Math.max(0, Math.min(usableSize, pos - padding));
    const percent = usableSize > 0 ? (adjustedPos / usableSize) * 100 : 0;

    setHoverPercent(percent);
    setHoverPos(pos);
  }, [isDragging, vertical]);

  const handleTrackLeave = useCallback(() => {
    if (!isDragging) {
      setHoverPercent(null);
    }
  }, [isDragging]);

  // Whether the hover is over a gap
  const hoverInGap = useMemo(() => {
    if (hoverPercent === null) return false;
    return isInGap(hoverPercent);
  }, [hoverPercent, isInGap]);

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
    handleTrackInteraction(e.clientX, e.clientY, true);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      handleTrackInteraction(e.clientX, e.clientY);
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

  const formatDateTime = (date: Date) => {
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // ── Shared sub-elements ──────────────────────────────────────────────

  const tooltipContent = hoverInGap
    ? 'No data available'
    : hoverDate ? formatDateTime(hoverDate) : '';

  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    width: '24px',
    height: '24px',
    background: 'var(--accent-primary)',
    borderRadius: '50%',
    border: '3px solid #fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    ...(vertical
      ? {
          left: '50%',
          top: percentToPosition(currentPercent),
          transform: 'translate(-50%, -50%)',
          transition: isDragging ? 'none' : 'top 0.1s ease',
        }
      : {
          top: '50%',
          left: percentToPosition(currentPercent),
          transform: 'translate(-50%, -50%)',
          transition: isDragging ? 'none' : 'left 0.1s ease',
        }),
  };

  // ── Vertical layout ──────────────────────────────────────────────────

  if (vertical) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '0 0.25rem',
      }}>
        {/* Current time display (hidden when shown externally) */}
        {!hideCurrentTime && (
          <div style={{
            textAlign: 'center',
            marginBottom: '0.375rem',
            fontSize: '0.8rem',
            fontWeight: '500',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
          }}>
            {formatDateTime(current)}
          </div>
        )}

        {/* Earliest date label */}
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.25rem',
          whiteSpace: 'nowrap',
        }}>
          {formatDate(earliest)}
        </div>

        {/* Vertical timeline track */}
        <div
          ref={trackRef}
          data-timeline-track
          onMouseDown={handleMouseDown}
          onMouseMove={handleTrackHover}
          onMouseLeave={handleTrackLeave}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'relative',
            width: '24px',
            flex: 1,
            minHeight: '100px',
            background: 'var(--bg-tertiary)',
            borderRadius: '12px',
            cursor: hoverInGap ? 'not-allowed' : 'pointer',
            overflow: 'visible',
          }}
        >
          {/* Hover tooltip — to the right of the track */}
          {hoverDate && (
            <div style={{
              position: 'absolute',
              left: '100%',
              top: `${hoverPos}px`,
              transform: 'translateY(-50%)',
              marginLeft: '8px',
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
              {tooltipContent}
            </div>
          )}

          {/* Progress fill — from top down to thumb */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: percentToPosition(currentPercent),
              background: 'var(--accent-primary)',
              opacity: 0.3,
              borderRadius: '12px 12px 0 0',
            }}
          />

          {/* Gap regions */}
          {gapRegions.map((gap, i) => (
            <div
              key={i}
              title="No data available"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${gap.startPct}%`,
                height: `${gap.endPct - gap.startPct}%`,
                background: 'rgba(139, 0, 0, 0.55)',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          ))}

          {/* Thumb */}
          <div style={thumbStyle} />
        </div>

        {/* Latest date label */}
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-secondary)',
          marginTop: '0.25rem',
          whiteSpace: 'nowrap',
        }}>
          {formatDate(latest)}
        </div>
      </div>
    );
  }

  // ── Horizontal layout (default) ──────────────────────────────────────

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
        {formatDateTime(current)}
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
          cursor: hoverInGap ? 'not-allowed' : 'pointer',
          overflow: 'visible',
        }}
      >
        {/* Hover tooltip */}
        {hoverDate && (
          <div style={{
            position: 'absolute',
            bottom: '100%',
            left: `${hoverPos}px`,
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
            {tooltipContent}
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

        {/* Gap regions — dark red overlay for periods with no data */}
        {gapRegions.map((gap, i) => (
          <div
            key={i}
            title="No data available"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${gap.startPct}%`,
              width: `${gap.endPct - gap.startPct}%`,
              background: 'rgba(139, 0, 0, 0.55)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}

        {/* Thumb */}
        <div style={thumbStyle} />
      </div>
    </div>
  );
}
