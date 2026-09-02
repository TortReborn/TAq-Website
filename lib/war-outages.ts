/**
 * Known windows where Wynncraft guild wars were actually disabled or broken
 * server-side, so no territory exchanges happened in-game. Recording gaps
 * that fall inside these windows are NOT missing data — territory state
 * genuinely did not change — so the timeline should treat them as ordinary
 * quiet time instead of red no-data gaps.
 *
 * Classification method (2026-09): for each >1-day gap in territory_exchanges,
 * every territory's owner going into the gap was compared with the
 * defender_name of its first exchange after the gap (defender comes from the
 * source war feeds, i.e. the game's actual previous owner, so this measures
 * real in-game state). Windows below showed 0 ownership changes across
 * ~270-400 territories; genuine recording outages in 2020-2021 showed 12-49%
 * churn over far shorter spans.
 *
 * Corroboration: the Dec 2019 window starts on the 1.19 Silent Expanse
 * release day and the 1.19.1 patch notes (Dec 12, 2019) announce wars being
 * brought back online. The Aug 2024 window is the 2.1 Rekindled World
 * release; 394/406 territories carried over and the remainder simply became
 * unclaimed ("None") in the update itself.
 */

export interface WarOutageWindow {
  /** Inclusive day (UTC) the outage window begins. */
  start: string;
  /** Inclusive day (UTC) the outage window ends. */
  end: string;
  reason: string;
}

export const WAR_OUTAGE_WINDOWS: WarOutageWindow[] = [
  // One ~6-week outage; a single stray exchange on 2019-05-05 splits it into
  // two detected gaps (0/319 and 0/378 territories changed at resume).
  { start: '2019-04-06', end: '2019-05-22', reason: 'Wars offline (1.18 era); zero ownership changes across the window' },
  // 1.19 Silent Expanse release; wars re-enabled in 1.19.1 (Dec 12, 2019).
  { start: '2019-12-08', end: '2019-12-13', reason: '1.19 Silent Expanse release; wars brought back online in 1.19.1' },
  // 2.1 Rekindled World release (Aug 10, 2024). No guild-vs-guild exchanges
  // missed; 12 territories were vacated to "None" by the update itself.
  { start: '2024-08-11', end: '2024-08-13', reason: '2.1 Rekindled World release; update reset some claims to unclaimed' },
  { start: '2025-05-28', end: '2025-06-06', reason: 'Wars down; zero ownership changes across 400 territories' },
  { start: '2025-06-18', end: '2025-06-21', reason: 'Wars down; zero ownership changes across 403 territories' },
  { start: '2025-09-12', end: '2025-09-19', reason: 'Wars down; zero ownership changes across 401 territories' },
];

/** Outage windows with day-string bounds resolved to UTC millisecond ranges
 *  (start of first day .. end of last day), for timestamp math in the UI. */
export const WAR_OUTAGE_WINDOWS_MS = WAR_OUTAGE_WINDOWS.map(w => ({
  ...w,
  startMs: Date.parse(`${w.start}T00:00:00Z`),
  endMs: Date.parse(`${w.end}T23:59:59.999Z`),
  // The end day is when exchanges resumed — jump targets land here.
  resumeMs: Date.parse(`${w.end}T00:00:00Z`),
}));

export type WarOutageWindowMs = (typeof WAR_OUTAGE_WINDOWS_MS)[number];

/** The war outage window containing `date`, or null. The end day is when
 *  exchanges resumed, so the window is half-open at `resumeMs` — jumping to
 *  the resume point lands on clean time with no warning. */
export function outageAt(date: Date): WarOutageWindowMs | null {
  const ms = date.getTime();
  return WAR_OUTAGE_WINDOWS_MS.find(w => ms >= w.startMs && ms < w.resumeMs) ?? null;
}

/** Tolerance for matching a detected gap against an outage window. Gap
 *  detection works on day granularity and boundary days shift if stray
 *  events are ever backfilled, so allow one day of slack per edge. */
const EDGE_TOLERANCE_MS = 24 * 60 * 60 * 1000;

/**
 * True when a detected no-data gap lies within a known war outage window
 * (and therefore should not be surfaced as a gap at all).
 */
export function isKnownWarOutage(gapStart: Date, gapEnd: Date): boolean {
  const gs = gapStart.getTime();
  const ge = gapEnd.getTime();
  return WAR_OUTAGE_WINDOWS.some(w => {
    const ws = Date.parse(`${w.start}T00:00:00Z`) - EDGE_TOLERANCE_MS;
    const we = Date.parse(`${w.end}T23:59:59Z`) + EDGE_TOLERANCE_MS;
    return gs >= ws && ge <= we;
  });
}
