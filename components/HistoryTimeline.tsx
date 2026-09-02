"use client";

import { memo, useMemo, useCallback, useRef, useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { SeasonPeriod, seasonAtDate, seasonColor } from "@/lib/seasons";
import { outageAt } from "@/lib/war-outages";

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

// Chronicle dates are UTC midnights — format them in UTC so they don't
// display one day early in western timezones.
const DATE_FORMAT_UTC = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

// Format date for display
const formatDate = (date: Date) => DATE_FORMAT.format(date);
const formatDateTime = (date: Date) => DATE_TIME_FORMAT.format(date);

// Amber warning accent — used by the outage/logging-gap badge and tooltip
// line. A literal (not a theme token) so it reads as "warning" in both themes.
const WARNING_COLOR = '#d97706';


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

// Jumping to a chronicle event lands this far before its start, so the
// viewer gets some leadup instead of arriving mid-kickoff
export const EVENT_LEADUP_MS = 30 * 60 * 1000;

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
  /** What the zoom window represents — event/wheel zooms are not season selections */
  kind?: 'season' | 'event' | 'wheel';
}

/** Chronicle event surfaced as a timeline marker */
export interface TimelineEventMarker {
  id: number;
  title: string;
  color: string;
  startMs: number;
  endMs: number | null;
}

/** Chronicle alliance lifetime surfaced as a colored band over the track */
export interface TimelineAllianceSpan {
  id: number;
  name: string;
  tag: string;
  color: string;
  kind: 'war' | 'community';
  startMs: number;
  endMs: number | null; // null = still active
}

interface HistoryTimelineProps {
  earliest: Date;
  latest: Date;
  current: Date;
  onChange: (date: Date) => void;
  // Logging gaps — periods where wars continued but no exchanges were
  // recorded. Not rendered on the track; surfaced via the warning badge
  // and hover tooltip instead. (Known war-outage windows, where nothing
  // actually changed, come from lib/war-outages and are handled separately.)
  gaps?: Array<{ start: Date; end: Date }>;
  vertical?: boolean;
  hideCurrentTime?: boolean; // Hide the current time display (shown externally)
  seasons?: SeasonPeriod[]; // On/off-season periods to overlay as context
  // Season zoom is controlled by the parent when these are provided, so the
  // panel's season selector and the track's right-click zoom share one state
  seasonZoom?: SeasonZoom | null;
  onSeasonZoomChange?: (zoom: SeasonZoom | null) => void;
  /** Chronicle events — markers on the track, click jumps to the event start */
  eventMarkers?: TimelineEventMarker[];
  /** Chronicle alliances — stacked lifetime bands beside the track, hover names them */
  allianceSpans?: TimelineAllianceSpan[];
}

function HistoryTimeline({
  earliest: earliestProp,
  latest: latestProp,
  current,
  onChange,
  gaps,
  vertical,
  hideCurrentTime,
  seasons,
  seasonZoom: seasonZoomProp,
  onSeasonZoomChange,
  eventMarkers,
  allianceSpans,
}: HistoryTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const hitboxRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverPercent, setHoverPercent] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState(0); // X position (horizontal) or Y position (vertical)
  const [hoveredEventId, setHoveredEventId] = useState<number | null>(null); // event marker under the cursor
  const [hoveredSpanId, setHoveredSpanId] = useState<number | null>(null); // alliance band under the cursor

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

  // Chronicle event markers clipped to the visible range
  const visibleEventMarkers = useMemo(() => {
    if (!eventMarkers || eventMarkers.length === 0 || totalRange === 0) return [];
    const eMs = earliest.getTime();
    const lMs = latest.getTime();
    return eventMarkers
      .filter(ev => ev.startMs <= lMs && (ev.endMs !== null ? ev.endMs >= eMs : ev.startMs >= eMs))
      .map(ev => ({
        ev,
        startPct: ((Math.min(Math.max(ev.startMs, eMs), lMs) - eMs) / totalRange) * 100,
        endPct: ev.endMs !== null ? ((Math.min(Math.max(ev.endMs, eMs), lMs) - eMs) / totalRange) * 100 : null,
        markerInRange: ev.startMs >= eMs && ev.startMs <= lMs,
      }));
  }, [eventMarkers, earliest, latest, totalRange]);

  // Alliance spans → Gantt lanes. Each alliance keeps ONE stable row for its
  // whole lifetime; overlapping alliances stack into separate lanes, and
  // non-overlapping eras reuse lanes (greedy interval packing).
  const allianceLanes = useMemo(() => {
    if (!allianceSpans || allianceSpans.length === 0 || totalRange === 0) {
      return { items: [] as Array<{ span: TimelineAllianceSpan; startPct: number; endPct: number; lane: number }>, laneCount: 0 };
    }
    const eMs = earliest.getTime();
    const lMs = latest.getTime();
    const visible = allianceSpans
      .map(span => ({ span, a: Math.max(span.startMs, eMs), b: Math.min(span.endMs ?? lMs, lMs) }))
      .filter(v => v.a < v.b)
      .sort((x, y) => x.a - y.a || x.span.id - y.span.id);
    const laneEnds: number[] = []; // occupied-until timestamp per lane
    const items = visible.map(({ span, a, b }) => {
      let lane = laneEnds.findIndex(end => end <= a);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(b); }
      else laneEnds[lane] = b;
      return {
        span,
        startPct: ((a - eMs) / totalRange) * 100,
        endPct: ((b - eMs) / totalRange) * 100,
        lane,
      };
    });
    return { items, laneCount: laneEnds.length };
  }, [allianceSpans, earliest, latest, totalRange]);

  // Lane count over the FULL (unzoomed) range — the ribbon reserves this
  // much thickness even when a zoom hides some or all alliances, so the
  // panel's overall size never jumps while zooming.
  const fullAllianceLaneCount = useMemo(() => {
    if (!allianceSpans || allianceSpans.length === 0) return 0;
    const eMs = earliestProp.getTime();
    const lMs = latestProp.getTime();
    const spans = allianceSpans
      .map(span => ({ a: Math.max(span.startMs, eMs), b: Math.min(span.endMs ?? lMs, lMs) }))
      .filter(v => v.a < v.b)
      .sort((x, y) => x.a - y.a);
    const laneEnds: number[] = [];
    for (const { a, b } of spans) {
      const lane = laneEnds.findIndex(end => end <= a);
      if (lane === -1) laneEnds.push(b);
      else laneEnds[lane] = b;
    }
    return laneEnds.length;
  }, [allianceSpans, earliestProp, latestProp]);

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

    const rawDate = percentToDate(percent);
    const newDate = snapTo10Min(rawDate);
    onChange(newDate);
  }, [vertical, percentToDate, onChange]);

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

  // Compute hovered date from percent
  const hoverDate = useMemo(() => {
    if (hoverPercent === null) return null;
    return percentToDate(hoverPercent);
  }, [hoverPercent, percentToDate]);

  // Logging gap / war-outage window under the hovered date, if any
  // (half-open — g.end is the day data resumed, matching WarStateBanner)
  const hoverGap = useMemo(() => {
    if (!hoverDate || !gaps) return null;
    return gaps.find(g => hoverDate >= g.start && hoverDate < g.end) ?? null;
  }, [hoverDate, gaps]);

  const hoverOutage = useMemo(
    () => (hoverDate ? outageAt(hoverDate) : null),
    [hoverDate]
  );

  // Which season (or off-season) the hovered date falls in
  const hoverSeason = useMemo(() => {
    if (!hoverDate || !seasons || seasons.length === 0) return null;
    return seasonAtDate(seasons, hoverDate);
  }, [hoverDate, seasons]);

  // ── Wheel zoom ───────────────────────────────────────────────────────
  // Scrolling over the track zooms the visible range around the cursor:
  // zoom in down to a one-month window, zoom out until the full timeline
  // (where the zoom state clears entirely). Attached as a NATIVE non-passive
  // listener — React registers wheel handlers as passive, so preventDefault
  // (needed to keep the page/map from also reacting) wouldn't work via JSX.
  const MIN_WHEEL_SPAN_MS = 30 * 24 * 3600 * 1000; // one month
  useEffect(() => {
    const el = hitboxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const padding = 12;
      const pos = vertical ? e.clientY - rect.top : e.clientX - rect.left;
      const trackSize = vertical ? rect.height : rect.width;
      const usable = trackSize - padding * 2;
      const frac = usable > 0 ? Math.max(0, Math.min(1, (pos - padding) / usable)) : 0.5;

      const viewStart = earliest.getTime();
      const span = latest.getTime() - viewStart;
      const fullStart = earliestProp.getTime();
      const fullEnd = latestProp.getTime();
      const fullSpan = fullEnd - fullStart;
      if (fullSpan <= 0) return;

      // Small trackpad deltas zoom gently, a mouse tick (±100) ~16% per notch
      const factor = Math.pow(1.0015, e.deltaY);
      const newSpan = Math.min(fullSpan, Math.max(MIN_WHEEL_SPAN_MS, span * factor));
      if (newSpan >= fullSpan) {
        setSeasonZoom(null);
        return;
      }
      // Keep the moment under the cursor stationary while the span changes
      const anchor = viewStart + frac * span;
      const newStart = Math.max(fullStart, Math.min(anchor - frac * newSpan, fullEnd - newSpan));
      const start = new Date(newStart);
      const end = new Date(newStart + newSpan);
      setSeasonZoom({ start, end, label: `${formatDate(start)} – ${formatDate(end)}`, kind: 'wheel' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [vertical, earliest, latest, earliestProp, latestProp, setSeasonZoom, MIN_WHEEL_SPAN_MS]);

  // Jump the scrubber to a season boundary (clamped to bounds + snapped)
  const jumpToDate = useCallback((date: Date) => {
    const clampedMs = Math.max(earliest.getTime(), Math.min(latest.getTime(), date.getTime()));
    const snapped = snapTo10Min(new Date(clampedMs));
    onChange(snapped);
  }, [earliest, latest, onChange]);

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

  const tooltipWarningLine = hoverOutage ? (
    <span style={{ color: WARNING_COLOR }}>Wars were down — nothing changed</span>
  ) : hoverGap ? (
    <span style={{ color: WARNING_COLOR }}>Logging gap — data missing</span>
  ) : null;

  const tooltipContent = hoverDate
    ? <>
        {formatDateTime(hoverDate)}
        {seasonTooltipLine && <><br />{seasonTooltipLine}</>}
        {tooltipWarningLine && <><br />{tooltipWarningLine}</>}
      </>
    : '';

  // The persistent "dead zone" warning lives on the map itself
  // (components/WarStateBanner.tsx) — the timeline only annotates its
  // hover tooltip via tooltipWarningLine above.

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

  // ── Chronicle event markers ──────────────────────────────────────────
  // Each event is a track-height pill at its start; clicking moves the
  // scrubber to shortly before the event starts, so there's some leadup
  // before things kick off.

  const eventMarkerElements = (isVert: boolean) => visibleEventMarkers.map(({ ev, startPct, markerInRange }) => {
    if (!markerInRange) return null;
    return (
      <div
        key={`ev-${ev.id}`}
        onMouseDown={(e) => { e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); jumpToDate(new Date(ev.startMs - EVENT_LEADUP_MS)); }}
        onMouseEnter={() => { setHoveredEventId(ev.id); setHoverPercent(null); }}
        onMouseLeave={() => setHoveredEventId(null)}
        onMouseMove={(e) => { e.stopPropagation(); }}
        style={{
          // Pills inside the track — full bar height, slightly inset; the
          // scrub thumb (zIndex 2) paints over them.
          position: 'absolute',
          ...(isVert
            ? { left: '2px', right: '2px', top: `calc(${percentToPaddedStart(startPct)} - 3px)`, height: '6px' }
            : { top: '2px', bottom: '2px', left: `calc(${percentToPaddedStart(startPct)} - 3px)`, width: '6px' }),
          borderRadius: '3px',
          background: ev.color,
          border: '1px solid var(--bg-card-solid)',
          cursor: 'pointer',
          pointerEvents: 'auto',
          zIndex: 1,
        }}
      >
        {hoveredEventId === ev.id && (
          <div style={{
            position: 'absolute',
            ...(isVert
              ? { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
              : { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' }),
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
            <div style={{ fontWeight: 600 }}>{ev.title}</div>
          </div>
        )}
      </div>
    );
  });

  // ── Chronicle alliance Gantt lanes ───────────────────────────────────
  // Labeled Gantt rows under the track: each alliance is one solid band with
  // its name printed inside whenever the band is wide enough. Hover names any
  // band (single tooltip); clicking zooms the timeline to that era.

  const BAND_SIZE = 12;
  const BAND_GAP = 2;
  // Label sizing estimate at 9px font: ~5.6px per character + horizontal padding.
  // Full name if it fits, else the tag, else no label (tooltip still names it).
  const LABEL_PX_PER_CHAR = 5.6;
  const LABEL_PAD_PX = 12;

  const bandTextColor = (hex: string): string => {
    const n = parseInt(hex.slice(1), 16);
    if (isNaN(n)) return 'rgba(255,255,255,0.92)';
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.92)';
  };

  const zoomToSpan = useCallback((span: TimelineAllianceSpan) => {
    const DAY = 24 * 3600 * 1000;
    const startMs = span.startMs;
    const endMs = span.endMs ?? latestProp.getTime();
    const pad = Math.max((endMs - startMs) * 0.1, DAY);
    setSeasonZoom({ start: new Date(startMs - pad), end: new Date(endMs + pad), label: span.name, kind: 'event' });
    const zs = Math.max(earliestProp.getTime(), startMs - pad);
    const ze = Math.min(latestProp.getTime(), endMs + pad);
    if (current.getTime() < zs || current.getTime() > ze) {
      jumpToDate(new Date(Math.max(zs, Math.min(ze, startMs))));
    }
  }, [setSeasonZoom, earliestProp, latestProp, current, jumpToDate]);

  const allianceRibbon = (isVert: boolean) => {
    // Size from the full-range lane count (not the zoom-scoped one) so the
    // ribbon keeps its thickness even when zooming hides every alliance.
    if (fullAllianceLaneCount === 0) return null;
    const stackSize = fullAllianceLaneCount * (BAND_SIZE + BAND_GAP) - BAND_GAP;

    // One tooltip for the whole stack, anchored at the hovered span's midpoint
    // (clamped inward so it can't clip at the panel edges).
    const hoveredItem = hoveredSpanId !== null
      ? allianceLanes.items.find(it => it.span.id === hoveredSpanId) ?? null
      : null;
    const tooltip = hoveredItem && (() => {
      const { span, startPct, endPct } = hoveredItem;
      const midPct = (startPct + endPct) / 2;
      // Near the panel edges, pin the tooltip's near edge instead of centering
      // it — a centered tooltip at 10% would clip outside the panel.
      const align = midPct < 18 ? 'translateX(0)' : midPct > 82 ? 'translateX(-100%)' : 'translateX(-50%)';
      return (
        <div style={{
          position: 'absolute',
          ...(isVert
            ? { right: '100%', top: percentToPaddedStart(Math.min(88, Math.max(12, midPct))), transform: 'translateY(-50%)', marginRight: '8px' }
            : { bottom: '100%', left: percentToPaddedStart(midPct), transform: align, marginBottom: '6px' }),
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 600 }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '2px', background: span.color, flexShrink: 0 }} />
            {span.name}{span.tag ? ` [${span.tag}]` : ''}
            {span.kind === 'community' && (
              <span style={{ fontWeight: 400, opacity: 0.65, fontSize: '0.68rem' }}>· community</span>
            )}
          </div>
          <div style={{ opacity: 0.7 }}>
            {DATE_FORMAT_UTC.format(new Date(span.startMs))} – {span.endMs === null ? 'active' : DATE_FORMAT_UTC.format(new Date(span.endMs))}
            <span style={{ opacity: 0.8 }}> · click to zoom</span>
          </div>
        </div>
      );
    })();

    return (
      <div style={{
        position: 'relative',
        flexShrink: 0,
        ...(isVert
          ? { width: `${stackSize}px`, height: '100%', marginLeft: '4px' }
          : { height: `${stackSize}px`, width: '100%', marginTop: '4px' }),
      }}>
        {allianceLanes.items.map(({ span, startPct, endPct, lane }) => {
          const hovered = hoveredSpanId === span.id;
          const lanePos = lane * (BAND_SIZE + BAND_GAP);
          // Band length in px, from the real track size when available (the
          // ref is set after first paint; 700 is a harmless first-frame guess)
          const trackRect = trackRef.current?.getBoundingClientRect();
          const trackPx = (isVert ? trackRect?.height : trackRect?.width) ?? 700;
          const bandPx = ((endPct - startPct) / 100) * Math.max(trackPx - 24, 1);
          const fits = (text: string) => bandPx >= text.length * LABEL_PX_PER_CHAR + LABEL_PAD_PX;
          const label = fits(span.name) ? span.name : span.tag && fits(span.tag) ? span.tag : null;
          // The hitbox extends half the lane gap past the visual band on every
          // side, so adjacent bands' hit areas touch (or slightly overlap) and
          // hover never drops out in the gap between them. The inner div draws
          // the band at its exact geometry.
          const HIT = BAND_GAP / 2 + 0.5;
          return (
            <div
              key={`al-${span.id}`}
              data-testid={`timeline-alliance-${span.id}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); zoomToSpan(span); }}
              onMouseEnter={() => { setHoveredSpanId(span.id); setHoverPercent(null); }}
              onMouseLeave={() => setHoveredSpanId(prev => (prev === span.id ? null : prev))}
              onMouseMove={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                ...(isVert
                  ? {
                      left: `${lanePos - HIT}px`,
                      width: `${BAND_SIZE + 2 * HIT}px`,
                      top: `calc(${percentToPaddedStart(startPct)} - ${HIT}px)`,
                      height: `calc(${percentToPaddedWidth(startPct, endPct)} + ${2 * HIT}px)`,
                      minHeight: '4px',
                    }
                  : {
                      top: `${lanePos - HIT}px`,
                      height: `${BAND_SIZE + 2 * HIT}px`,
                      left: `calc(${percentToPaddedStart(startPct)} - ${HIT}px)`,
                      width: `calc(${percentToPaddedWidth(startPct, endPct)} + ${2 * HIT}px)`,
                      minWidth: '4px',
                    }),
                cursor: 'pointer',
                pointerEvents: 'auto',
              }}
            >
              <div style={{
                position: 'absolute',
                inset: `${HIT}px`,
                background: span.color,
                borderRadius: '3px',
                opacity: hoveredSpanId === null ? 0.95 : hovered ? 1 : 0.45,
                overflow: 'hidden',
              }}>
                {label && (
                  <div style={{
                    ...(isVert
                      ? { writingMode: 'vertical-rl' as const, padding: '4px 0', height: '100%' }
                      : { padding: '0 5px', lineHeight: `${BAND_SIZE}px` }),
                    fontSize: '9px',
                    fontWeight: 700,
                    letterSpacing: '0.02em',
                    color: bandTextColor(span.color),
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    userSelect: 'none',
                  }}>
                    {label}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {tooltip}
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
    // Rendered even when no season period is visible (e.g. wheel-zoomed into
    // the pre-season era) — the bare gray strip keeps the layout consistent.
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

  // Reset-zoom button — shown top-left when zoomed into a season or event.
  // Event zooms also show the event's title, since they aren't a season the
  // selector could name.
  const resetZoomButton = seasonZoom ? (
    <div style={{ position: 'absolute', top: 0, left: 0, zIndex: 25, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <button
        onClick={(e) => { e.stopPropagation(); setSeasonZoom(null); }}
        onMouseDown={(e) => e.stopPropagation()}
        data-testid="timeline-reset-zoom"
        title={`Zoomed to ${seasonZoom.label === 'Off' ? 'off-season' : seasonZoom.label} — back to full range`}
        style={{
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
      {seasonZoom.kind === 'event' && (
        <span style={{
          padding: '0.1rem 0.4rem',
          fontSize: '0.65rem',
          fontWeight: 600,
          color: 'var(--text-primary)',
          background: 'var(--bg-card-solid, var(--bg-card))',
          border: '1px solid var(--border-color)',
          borderRadius: '0.375rem',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }}>
          {seasonZoom.label}
        </span>
      )}
    </div>
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

        {/* Ribbon + track row */}
        <div style={{
          display: 'flex',
          flex: 1,
          minHeight: '100px',
          alignItems: 'stretch',
        }}>
          {/* Season ribbon + vertical track — one shared hitbox */}
          <div
            ref={hitboxRef}
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
              cursor: 'pointer',
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

            {/* Chronicle event markers */}
            {eventMarkerElements(true)}

            {/* Thumb */}
            <div data-testid="timeline-thumb" style={thumbStyle} />
          </div>

          {/* Chronicle alliance stream ribbon */}
          {allianceRibbon(true)}
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
        ref={hitboxRef}
        data-timeline-track
        onMouseDown={handleMouseDown}
        onMouseMove={handleTrackHover}
        onMouseLeave={handleTrackLeave}
        onContextMenu={handleContextMenu}
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: 'pointer' }}
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

        {/* Chronicle event markers */}
        {eventMarkerElements(false)}

        {/* Thumb */}
        <div data-testid="timeline-thumb" style={thumbStyle} />
      </div>

      {/* Chronicle alliance stream ribbon */}
      {allianceRibbon(false)}
      </div>

    </div>
  );
}

export default memo(HistoryTimeline);
