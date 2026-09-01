"use client";

import { memo, useMemo, useCallback, useRef, useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { SeasonPeriod, seasonAtDate, seasonColor } from "@/lib/seasons";

// Cached formatters — creating Intl.DateTimeFormat instances is expensive,
// and toLocale* calls construct one per invocation.
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

// Format date for display
const formatDate = (date: Date) => DATE_FORMAT.format(date);
const formatDateTime = (date: Date) => DATE_TIME_FORMAT.format(date);

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

// Snap to nearest 10-minute boundary (matching server snapshot interval)
const SNAP_INTERVAL_MS = 10 * 60 * 1000;
const snapTo10Min = (targetDate: Date): Date => {
  const ms = targetDate.getTime();
  const snapped = ms - (ms % SNAP_INTERVAL_MS);
  return new Date(snapped);
};

export interface SeasonZoom {
  start: Date;
  end: Date;
  label: string;
}

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  gaps?: Array<{ start: Date; end: Date }>; // Time ranges with no data
  vertical?: boolean;
  hideCurrentTime?: boolean; // Hide the current time display (shown externally)
  loadedRanges?: Array<[number, number]>; // [startMs, endMs][] — loaded event ranges
  seasons?: SeasonPeriod[]; // On/off-season periods to overlay as context
  // Season zoom is controlled by the parent when these are provided, so the
  // panel's season selector and the track's right-click zoom share one state
  seasonZoom?: SeasonZoom | null;
  onSeasonZoomChange?: (zoom: SeasonZoom | null) => void;
}

function HistoryTimeline({
  earliest: earliestProp,
  latest: latestProp,
  current,
  onChange,
  gaps,
  vertical,
  hideCurrentTime,
  loadedRanges,
  seasons,
  seasonZoom: seasonZoomProp,
  onSeasonZoomChange,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0); // X position (horizontal) or Y position (vertical)

  // Season zoom: when set, the timeline is scoped to a single season/off-season period.
  // The effective range is the intersection of that period with the available data bounds,
  // so all downstream math (percentages, ribbon, gaps, labels) re-scopes automatically.
  // Controlled by the parent when seasonZoom/onSeasonZoomChange props are given.
  const [internalZoom, setInternalZoom] = useState<SeasonZoom | null>(null);
  const seasonZoom = seasonZoomProp !== undefined ? seasonZoomProp : internalZoom;
  const setSeasonZoom = onSeasonZoomChange ?? setInternalZoom;

  const earliest = useMemo(
    () => (seasonZoom ? new Date(Math.max(earliestProp.getTime(), seasonZoom.start.getTime())) : earliestProp),
    [seasonZoom, earliestProp]
  );
  const latest = useMemo(
    () => (seasonZoom ? new Date(Math.min(latestProp.getTime(), seasonZoom.end.getTime())) : latestProp),
    [seasonZoom, latestProp]
  );

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

  // Precompute season-period positions as percentages, clipped to the visible range
  const seasonRegions = useMemo(() => {
    if (!seasons || seasons.length === 0 || totalRange === 0) return [];
    const earliestMs = earliest.getTime();
    const latestMs = latest.getTime();
    return seasons
      .map((period) => {
        const clampedStart = Math.max(earliestMs, period.start.getTime());
        const clampedEnd = Math.min(latestMs, period.end.getTime());
        if (clampedStart >= clampedEnd) return null;
        const title = period.type === 'season'
          ? `Season ${period.season} (${formatDate(period.start)} – ${formatDate(period.end)})`
          : `Off-season (${formatDate(period.start)} – ${formatDate(period.end)})`;
        return {
          period,
          title,
          startPct: ((clampedStart - earliestMs) / totalRange) * 100,
          endPct: ((clampedEnd - earliestMs) / totalRange) * 100,
        };
      })
      .filter((r): r is { period: SeasonPeriod; title: string; startPct: number; endPct: number } => r !== null);
  }, [seasons, earliest, latest, totalRange]);

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

  // Once loaded ranges cover the whole visible span there is nothing left to
  // communicate — the indicator bar is hidden entirely.
  const fullyLoaded = useMemo(() => {
    if (loadedRegions.length === 0) return false;
    const covered = loadedRegions.reduce((sum, r) => sum + (r.endPct - r.startPct), 0);
    return covered >= 99.9;
  }, [loadedRegions]);

  // Calculate the position as a percentage
  const currentPercent = useMemo(() => {
    if (totalRange === 0) return 0;
    const raw = ((current.getTime() - earliest.getTime()) / totalRange) * 100;
    // Clamp so the thumb stays on-track even if `current` sits outside a zoomed window.
    return Math.max(0, Math.min(100, raw));
  }, [current, earliest, totalRange]);

  // Convert a percentage position to a date
  const percentToDate = useCallback((percent: number): Date => {
    const clampedPercent = Math.max(0, Math.min(100, percent));
    const timestamp = earliest.getTime() + (clampedPercent / 100) * totalRange;
    return new Date(timestamp);
  }, [earliest, totalRange]);

  // Throttle ref for drag interactions (16ms = ~60fps)
  const lastDragUpdateRef = useRef<number>(0);

  // rAF throttle for hover tracking — latest pointer position is stored here
  // and flushed once per frame
  const hoverRafRef = useRef<number | null>(null);
  const hoverPointRef = useRef({ clientX: 0, clientY: 0 });

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
  }, [vertical, percentToDate, onChange, isInGap]);

  const cancelHoverFrame = useCallback(() => {
    if (hoverRafRef.current !== null) {
      cancelAnimationFrame(hoverRafRef.current);
      hoverRafRef.current = null;
    }
  }, []);

  // Cancel any pending hover frame on unmount
  useEffect(() => cancelHoverFrame, [cancelHoverFrame]);

  // Hover tracking for tooltip — throttled to one state update per frame
  const handleTrackHover = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    hoverPointRef.current = { clientX: e.clientX, clientY: e.clientY };
    if (hoverRafRef.current !== null) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const padding = 12;

      const { clientX, clientY } = hoverPointRef.current;
      const pos = vertical ? clientY - rect.top : clientX - rect.left;
      const trackSize = vertical ? rect.height : rect.width;
      const usableSize = trackSize - padding * 2;
      const adjustedPos = Math.max(0, Math.min(usableSize, pos - padding));
      const percent = usableSize > 0 ? (adjustedPos / usableSize) * 100 : 0;

      setHoverPercent(percent);
      setHoverPos(pos);
    });
  }, [isDragging, vertical]);

  const handleTrackLeave = useCallback(() => {
    cancelHoverFrame();
    if (!isDragging) {
      setHoverPercent(null);
    }
  }, [isDragging, cancelHoverFrame]);

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

  // Which season (or off-season) the hovered date falls in
  const hoverSeason = useMemo(() => {
    if (!hoverDate || !seasons || seasons.length === 0) return null;
    return seasonAtDate(seasons, hoverDate);
  }, [hoverDate, seasons]);

  // Jump the scrubber to a season boundary (clamped to bounds + snapped), skipping no-data gaps
  const jumpToDate = useCallback((date: Date) => {
    const clampedMs = Math.max(earliest.getTime(), Math.min(latest.getTime(), date.getTime()));
    const snapped = snapTo10Min(new Date(clampedMs));
    const pct = totalRange === 0 ? 0 : ((snapped.getTime() - earliest.getTime()) / totalRange) * 100;
    if (isInGap(pct)) return;
    onChange(snapped);
  }, [earliest, latest, totalRange, isInGap, onChange]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left button only — right button zooms to season
    e.preventDefault();
    e.stopPropagation();
    cancelHoverFrame();
    setIsDragging(true);
    setHoverPercent(null);
    handleTrackInteraction(e.clientX, e.clientY, true);
  };

  // Right-click on the track (or the season strip above it) zooms the
  // timeline to the season/off-season period under the cursor.
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!seasons || seasons.length === 0) return;
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const padding = 12;
    const pos = vertical ? e.clientY - rect.top : e.clientX - rect.left;
    const trackSize = vertical ? rect.height : rect.width;
    const usableSize = trackSize - padding * 2;
    const adjustedPos = Math.max(0, Math.min(usableSize, pos - padding));
    const percent = usableSize > 0 ? (adjustedPos / usableSize) * 100 : 0;

    const period = seasonAtDate(seasons, percentToDate(percent));
    if (!period) return;
    setSeasonZoom({ start: period.start, end: period.end, label: period.label });
    // Bring the scrubber into the zoomed range if it's currently outside it
    const zs = Math.max(earliestProp.getTime(), period.start.getTime());
    const ze = Math.min(latestProp.getTime(), period.end.getTime());
    if (current.getTime() < zs || current.getTime() > ze) {
      jumpToDate(new Date(zs));
    }
  }, [seasons, vertical, percentToDate, earliestProp, latestProp, current, jumpToDate]);

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

  // ── Shared sub-elements ──────────────────────────────────────────────

  const seasonTooltipLine = hoverSeason ? (
    <span style={{ opacity: 0.8, color: hoverSeason.type === 'season' ? seasonColor(hoverSeason.season!) : 'var(--text-secondary)' }}>
      {hoverSeason.type === 'season'
        ? `Season ${hoverSeason.season}`
        : 'Off-season'}
    </span>
  ) : null;

  const tooltipContent = hoverDate
    ? (hoverInGap && hoverGap
      ? <>{formatDate(hoverGap.start)} – {formatDate(hoverGap.end)}<br /><span style={{ opacity: 0.7 }}>No data available</span></>
      : <>{formatDateTime(hoverDate)}{seasonTooltipLine && <><br />{seasonTooltipLine}</>}</>)
    : '';

  const thumbStyle: React.CSSProperties = {
    position: 'absolute',
    width: '24px',
    height: '24px',
    background: 'var(--accent-primary)',
    borderRadius: '50%',
    border: '3px solid #fff',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
    // Above the gap overlays (zIndex 1) — the scrub thumb must never be
    // painted over by the no-data stripes
    zIndex: 2,
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
    const RED = 'rgb(130, 30, 30)';
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

  // ── Season ribbon ────────────────────────────────────────────────────
  // A thin strip flush against the track showing on-season (colored) vs
  // off-season (hatched) periods. It is part of the track's hitbox: left-click
  // scrubs to that spot, right-click zooms the timeline to that period —
  // the strip itself is passive (pointer-events: none) so events land on the
  // shared wrapper.

  const seasonRibbon = (isVert: boolean) => {
    if (seasonRegions.length === 0) return null;
    const OFF_HATCH = 'repeating-linear-gradient(45deg, rgba(140,140,140,0.30) 0 4px, rgba(140,140,140,0.08) 4px 8px)';

    // Segments use the same thumb-padded positioning as the loaded bar below;
    // the 12px padding zones at each end are filled by caps that continue
    // whatever segment touches that edge (colored from the SAME region list,
    // so the cap can never be a slightly different shade than its neighbor).
    // No segment at the edge → container background, i.e. invisible.
    const regionBg = (r: { period: SeasonPeriod }) =>
      r.period.type === 'season' ? seasonColor(r.period.season!) : OFF_HATCH;
    const startRegion = seasonRegions.find((r) => r.startPct <= 0.5);
    const endRegion = seasonRegions.find((r) => r.endPct >= 99.5);
    const startCap = startRegion ? regionBg(startRegion) : 'var(--bg-tertiary)';
    const endCap = endRegion ? regionBg(endRegion) : 'var(--bg-tertiary)';

    return (
      <div
        style={{
          position: 'relative',
          ...(isVert
            ? { width: '4px', borderRadius: '3px', height: '100%', flexShrink: 0 }
            : { height: '4px', borderRadius: '3px', width: '100%' }),
          background: 'var(--bg-tertiary)',
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        {/* Start / end caps — 13px so they extend 1px under the adjacent
            segment (rendered after, so it paints on top): without the overlap,
            fractional-pixel rounding at the junction leaves a dark hairline of
            the container background showing through */}
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { left: 0, right: 0, top: 0, height: '13px' }
            : { top: 0, bottom: 0, left: 0, width: '13px' }),
          background: startCap,
        }} />
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { left: 0, right: 0, bottom: 0, height: '13px' }
            : { top: 0, bottom: 0, right: 0, width: '13px' }),
          background: endCap,
        }} />
        {seasonRegions.map(({ period, startPct, endPct }, i) => {
          const isSeason = period.type === 'season';
          // No trailing separator on a segment that runs into the end cap —
          // it would draw a stray 1px line between the segment and the cap
          const atEnd = endPct >= 99.99;
          const separator = atEnd ? 'none' : '1px solid var(--bg-card-solid, rgba(0,0,0,0.4))';
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                ...(isVert
                  ? {
                      left: 0,
                      right: 0,
                      top: percentToPaddedStart(startPct),
                      height: percentToPaddedWidth(startPct, endPct),
                      borderBottom: separator,
                    }
                  : {
                      top: 0,
                      bottom: 0,
                      left: percentToPaddedStart(startPct),
                      width: percentToPaddedWidth(startPct, endPct),
                      borderRight: separator,
                    }),
                background: isSeason ? seasonColor(period.season!) : OFF_HATCH,
              }}
            />
          );
        })}
      </div>
    );
  };

  // Reset-zoom button — shown top-left of the component when zoomed into a season.
  const resetZoomButton = seasonZoom ? (
    <button
      onClick={(e) => { e.stopPropagation(); setSeasonZoom(null); }}
      onMouseDown={(e) => e.stopPropagation()}
      data-testid="timeline-reset-zoom"
      title={`Zoomed to ${seasonZoom.label === 'Off' ? 'off-season' : seasonZoom.label} — back to full range`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 25,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: '0.1rem 0.4rem',
        fontSize: '0.65rem',
        fontWeight: 600,
        color: 'var(--text-primary)',
        background: 'var(--bg-card-solid, var(--bg-card))',
        border: '1px solid var(--border-color)',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }}
    >
      <ArrowLeft size={11} strokeWidth={2.5} /> Full range
    </button>
  ) : null;

  // ── Vertical layout ──────────────────────────────────────────────────

  if (vertical) {
    return (
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        height: '100%',
        padding: '0 0.25rem',
      }}>
        {resetZoomButton}
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
          {/* Loaded-data indicator bar (left of track, hidden once fully loaded) */}
          {loadedRanges && !fullyLoaded && loadedIndicatorBar(true)}

          {/* Season ribbon + vertical track — one shared hitbox */}
          <div
            data-timeline-track
            onMouseDown={handleMouseDown}
            onMouseMove={handleTrackHover}
            onMouseLeave={handleTrackLeave}
            onContextMenu={handleContextMenu}
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'stretch',
              height: '100%',
              cursor: hoverInGap ? 'not-allowed' : 'pointer',
            }}
          >
          {seasons && seasons.length > 0 && seasonRibbon(true)}

          {/* Vertical timeline track */}
          <div
            ref={trackRef}
            style={{
              position: 'relative',
              width: '24px',
              height: '100%',
              background: 'var(--bg-tertiary)',
              borderRadius: '12px',
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

            {/* Gap regions — bound-touching gaps extend to the track edge (see
                the horizontal layout note) */}
            {gapRegions.map((gap, i) => {
              const startCss = gap.startPct <= 0.01 ? '0px' : percentToPaddedStart(gap.startPct);
              const endCss = gap.endPct >= 99.99 ? '100%' : percentToPaddedStart(gap.endPct);
              return (
                <div
                  key={i}
                  title="No data available"
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: startCss,
                    height: `calc(${endCss} - ${startCss})`,
                    background: 'rgba(139, 0, 0, 0.55)',
                    borderRadius: gap.startPct <= 0.01 ? '12px 12px 0 0' : gap.endPct >= 99.99 ? '0 0 12px 12px' : '0',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              );
            })}

            {/* Thumb */}
            <div data-testid="timeline-thumb" style={thumbStyle} />
          </div>
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
    <div style={{ position: 'relative', width: '100%', padding: '0.25rem 0' }}>
      {resetZoomButton}
      {/* Current time display - above the slider */}
      <div data-testid="timeline-current-time" style={{
        textAlign: 'center',
        marginBottom: '0.25rem',
        fontSize: '0.875rem',
        fontWeight: '500',
        color: 'var(--text-primary)',
        // Keeps the text from jittering horizontally during playback
        fontVariantNumeric: 'tabular-nums',
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

      {/* Season ribbon + timeline track — one shared hitbox: left-click scrubs,
          right-click zooms to the season under the cursor */}
      <div
        data-timeline-track
        onMouseDown={handleMouseDown}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
        onContextMenu={handleContextMenu}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: hoverInGap ? 'not-allowed' : 'pointer' }}
      >
      {seasons && seasons.length > 0 && seasonRibbon(false)}

      {/* Timeline track */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: '24px',
          background: 'var(--bg-tertiary)',
          borderRadius: '12px',
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

        {/* Gap regions — dark red overlay for periods with no data. Gaps that
            touch either bound extend through the 12px thumb-padding zone to
            the actual track edge, so they can't end in a floating blob. */}
        {gapRegions.map((gap, i) => {
          const startCss = gap.startPct <= 0.01 ? '0px' : percentToPaddedStart(gap.startPct);
          const endCss = gap.endPct >= 99.99 ? '100%' : percentToPaddedStart(gap.endPct);
          return (
            <div
              key={i}
              title="No data available"
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: startCss,
                width: `calc(${endCss} - ${startCss})`,
                background: 'rgba(139, 0, 0, 0.55)',
                borderRadius: gap.startPct <= 0.01 ? '12px 0 0 12px' : gap.endPct >= 99.99 ? '0 12px 12px 0' : '0',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            />
          );
        })}

        {/* Thumb */}
        <div data-testid="timeline-thumb" style={thumbStyle} />
      </div>
      </div>

      {/* Loaded-data indicator bar (below track, hidden once fully loaded) */}
      {loadedRanges && !fullyLoaded && loadedIndicatorBar(false)}
    </div>
  );
}

export default memo(HistoryTimeline);
