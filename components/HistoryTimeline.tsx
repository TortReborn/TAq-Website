"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  gaps?: Array<{ start: Date; end: Date }>; // Time ranges with no data
  vertical?: boolean;
  hideCurrentTime?: boolean; // Hide the current time display (shown externally)
  loadedRanges?: Array<[number, number]>; // [startMs, endMs][] — loaded event ranges
}

export default function HistoryTimeline({
  earliest,
  latest,
  current,
  onChange,
  gaps,
  vertical,
  hideCurrentTime,
  loadedRanges,
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

  // Precompute loaded-range positions as percentages of the total range
  const loadedRegions = useMemo(() => {
    if (!loadedRanges || loadedRanges.length === 0 || totalRange === 0) return [];
    const earliestMs = earliest.getTime();
    const latestMs = latest.getTime();
    return loadedRanges
      .map(([startMs, endMs]) => {
        const clampedStart = Math.max(earliestMs, startMs);
        const clampedEnd = Math.min(latestMs, endMs);
        if (clampedStart >= clampedEnd) return null;
        const startPct = ((clampedStart - earliestMs) / totalRange) * 100;
        const endPct = ((clampedEnd - earliestMs) / totalRange) * 100;
        return { startPct, endPct };
      })
      .filter((r): r is { startPct: number; endPct: number } => r !== null);
  }, [loadedRanges, earliest, latest, totalRange]);

  // Green regions = loaded regions with gap regions subtracted (has real data)
  const loadedGreenRegions = useMemo(() => {
    if (loadedRegions.length === 0) return [];
    if (gapRegions.length === 0) return loadedRegions;

    const result: Array<{ startPct: number; endPct: number }> = [];
    for (const loaded of loadedRegions) {
      let remaining: Array<{ startPct: number; endPct: number }> = [{ ...loaded }];
      for (const gap of gapRegions) {
        const next: Array<{ startPct: number; endPct: number }> = [];
        for (const seg of remaining) {
          if (gap.endPct <= seg.startPct || gap.startPct >= seg.endPct) {
            next.push(seg);
            continue;
          }
          if (gap.startPct > seg.startPct) {
            next.push({ startPct: seg.startPct, endPct: gap.startPct });
          }
          if (gap.endPct < seg.endPct) {
            next.push({ startPct: gap.endPct, endPct: seg.endPct });
          }
        }
        remaining = next;
      }
      result.push(...remaining);
    }
    return result;
  }, [loadedRegions, gapRegions]);

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

  // Convert a percentage to a padded CSS position (accounting for 12px track padding)
  // Used for gap bars and other overlay elements so they align with the thumb
  const percentToPaddedStart = (percent: number) => {
    return `calc(12px + ${percent} * (100% - 24px) / 100)`;
  };
  const percentToPaddedWidth = (startPct: number, endPct: number) => {
    return `calc(${endPct - startPct} * (100% - 24px) / 100)`;
  };

  // Convert a percentage position to a date
  const percentToDate = useCallback((percent: number): Date => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const timestamp = earliest.getTime() + (clampedPercent / 100) * totalRange;
    return new Date(timestamp);
  }, [earliest, totalRange]);

  // Snap to nearest 10-minute boundary (matching server snapshot interval)
  const SNAP_INTERVAL_MS = 10 * 60 * 1000;
  const snapTo10Min = useCallback((targetDate: Date): Date => {
    const ms = targetDate.getTime();
    const snapped = ms - (ms % SNAP_INTERVAL_MS);
    return new Date(snapped);
  }, []);

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
    const newDate = snapTo10Min(rawDate);
    onChange(newDate);
  }, [vertical, percentToDate, snapTo10Min, onChange, isInGap]);

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

  // Whether the hover is over a gap, and which gap
  const hoverInGap = useMemo(() => {
    if (hoverPercent === null) return false;
    return isInGap(hoverPercent);
  }, [hoverPercent, isInGap]);

  const hoverGap = useMemo(() => {
    if (hoverPercent === null || !gaps) return null;
    for (let i = 0; i < gapRegions.length; i++) {
      if (hoverPercent >= gapRegions[i].startPct && hoverPercent <= gapRegions[i].endPct) {
        return gaps[i];
      }
    }
    return null;
  }, [hoverPercent, gapRegions, gaps]);

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

  const tooltipContent = hoverDate
    ? (hoverInGap && hoverGap
      ? <>{formatDate(hoverGap.start)} – {formatDate(hoverGap.end)}<br /><span style={{ opacity: 0.7 }}>No data available</span></>
      : formatDateTime(hoverDate))
    : '';

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

  // ── Loaded-data indicator bar ────────────────────────────────────────
  // Shows a thin bar next to the slider: green = data loaded, red = not loaded.
  // In vertical mode it sits to the left; in horizontal mode it sits below.

  const loadedIndicatorBar = (isVert: boolean) => {
    // Determine cap colors: match the nearest segment's color at each edge
    const RED = 'rgba(180, 40, 40, 0.5)';
    const GRAY = 'rgb(100, 100, 100)';
    const GREEN = 'rgb(40, 167, 69)';

    const capColor = (edge: 'start' | 'end') => {
      const threshold = 0.5; // within 0.5% of edge
      if (edge === 'start') {
        if (loadedGreenRegions.some(r => r.startPct <= threshold)) return GREEN;
        if (loadedRegions.some(r => r.startPct <= threshold)) return GRAY;
        return RED;
      } else {
        if (loadedGreenRegions.some(r => r.endPct >= 100 - threshold)) return GREEN;
        if (loadedRegions.some(r => r.endPct >= 100 - threshold)) return GRAY;
        return RED;
      }
    };

    const startColor = capColor('start');
    const endColor = capColor('end');

    return (
      <div
        title="Data loading status"
        style={{
          position: 'relative',
          ...(isVert
            ? { width: '6px', borderRadius: '3px', flex: 1, minHeight: '100px' }
            : { height: '6px', borderRadius: '3px', width: '100%', marginTop: '4px' }),
          background: RED,
          overflow: 'hidden',
        }}
      >
        {/* Start cap — matches nearest segment color */}
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { left: 0, right: 0, top: 0, height: '12px' }
            : { top: 0, bottom: 0, left: 0, width: '12px' }),
          background: startColor,
        }} />
        {/* End cap — matches nearest segment color */}
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { left: 0, right: 0, bottom: 0, height: '12px' }
            : { top: 0, bottom: 0, right: 0, width: '12px' }),
          background: endColor,
        }} />
        {/* Gray segments for loaded-but-empty ranges (loaded region that overlaps gaps) */}
        {loadedRegions.map((region, i) => (
          <div
            key={`gray-${i}`}
            style={{
              position: 'absolute',
              ...(isVert
                ? {
                    left: 0,
                    right: 0,
                    top: percentToPaddedStart(region.startPct),
                    height: percentToPaddedWidth(region.startPct, region.endPct),
                  }
                : {
                    top: 0,
                    bottom: 0,
                    left: percentToPaddedStart(region.startPct),
                    width: percentToPaddedWidth(region.startPct, region.endPct),
                  }),
              background: GRAY,
            }}
          />
        ))}
        {/* Green segments for loaded ranges with actual data (gaps subtracted) */}
        {loadedGreenRegions.map((region, i) => (
          <div
            key={`green-${i}`}
            style={{
              position: 'absolute',
              ...(isVert
                ? {
                    left: 0,
                    right: 0,
                    top: percentToPaddedStart(region.startPct),
                    height: percentToPaddedWidth(region.startPct, region.endPct),
                  }
                : {
                    top: 0,
                    bottom: 0,
                    left: percentToPaddedStart(region.startPct),
                    width: percentToPaddedWidth(region.startPct, region.endPct),
                  }),
              background: GREEN,
            }}
          />
        ))}
      </div>
    );
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

        {/* Track + loaded indicator side by side */}
        <div style={{
          display: 'flex',
          gap: '4px',
          flex: 1,
          minHeight: '100px',
          alignItems: 'stretch',
        }}>
          {/* Loaded-data indicator bar (left of track) */}
          {loadedRanges && loadedIndicatorBar(true)}

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
              height: '100%',
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
                  top: percentToPaddedStart(gap.startPct),
                  height: percentToPaddedWidth(gap.startPct, gap.endPct),
                  background: 'rgba(139, 0, 0, 0.55)',
                  borderRadius: gap.startPct <= 0 ? '12px 12px 0 0' : gap.endPct >= 100 ? '0 0 12px 12px' : '0',
                  pointerEvents: 'none',
                  zIndex: 1,
                }}
              />
            ))}

            {/* Thumb */}
            <div style={thumbStyle} />
          </div>
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
              left: percentToPaddedStart(gap.startPct),
              width: percentToPaddedWidth(gap.startPct, gap.endPct),
              background: 'rgba(139, 0, 0, 0.55)',
              borderRadius: gap.startPct <= 0 ? '12px 0 0 12px' : gap.endPct >= 100 ? '0 12px 12px 0' : '0',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}

        {/* Thumb */}
        <div style={thumbStyle} />
      </div>

      {/* Loaded-data indicator bar (below track) */}
      {loadedRanges && loadedIndicatorBar(false)}
    </div>
  );
}
