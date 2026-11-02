/**
 * Recruitment tracking (TAQ-140): pfinder clock-in sessions and the guild's
 * shouts, and the guild applications the calendar shows as their result.
 * Client-safe; the database side is lib/recruitment-db.ts.
 *
 * Two kinds of day. The shout limit is the guild's, so it always counts UTC
 * days (utcDay). The calendar and its numbers are the viewer's: local days
 * by default, or UTC if they choose (calendarDays). A local day can be 23 or
 * 25 hours long across a clock change, so days are always stepped by the
 * calendar, never by adding 24 hours.
 */

export const SHOUTS_PER_DAY = 3;
/** A session longer than this is a forgotten clock-out, not recruiting. */
export const MAX_SESSION_HOURS = 24;
/** The longest range the page asks for at once: a month view's six weeks, with room to spare. */
export const MAX_RANGE_DAYS = 62;
const DAY = 86_400_000;

export interface PfinderSession { id: number; discord_id: string; ign: string; started_at: string; ended_at: string | null }
export interface Shout { id: number; discord_id: string; ign: string; shouted_at: string; slot: number; note: string | null }

export interface DaySummary {
  ms: number;
  /** pfinder time per member (by IGN) that day */
  people: Record<string, number>;
  shouts: number;
  /** guild applications submitted that day */
  apps: number;
}

type Time = string | number | Date;

// --- UTC: the shout limit -----------------------------------------------------

export const utcDay = (t: Time) => new Date(t).toISOString().slice(0, 10);
/** 'HH:MM' in UTC */
export const utcTime = (t: Time) => new Date(t).toISOString().slice(11, 16);
export const nextUtcMidnight = (now: number) => (Math.floor(now / DAY) + 1) * DAY;

// --- The calendar: the viewer's days, local or UTC ----------------------------

export interface Application { id: number; ign: string | null; status: string; submitted_at: string }

export interface DayBlock { session: PfinderSession; startMin: number; endMin: number; ms: number; lane: number }

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (day: string) => day.split('-').map(Number);

/**
 * Day helpers for the calendar, in UTC or in the zone the code runs in
 * (in the browser, the viewer's own). Days are 'YYYY-MM-DD' keys.
 */
export function calendarDays(utc: boolean) {
  const parts = (t: Time) => {
    const d = new Date(t);
    return utc
      ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes(), s: d.getUTCSeconds(), dow: d.getUTCDay() }
      : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate(), h: d.getHours(), min: d.getMinutes(), s: d.getSeconds(), dow: d.getDay() };
  };
  /** The moment a calendar date starts; month and day may overflow, as with Date. */
  const at = (y: number, m: number, d: number) => (utc ? Date.UTC(y, m, d) : new Date(y, m, d).getTime());

  /** The day a moment falls on. */
  const day = (t: Time) => {
    const p = parts(t);
    return `${p.y}-${pad(p.m + 1)}-${pad(p.d)}`;
  };
  /** 'HH:MM' */
  const time = (t: Time) => {
    const p = parts(t);
    return `${pad(p.h)}:${pad(p.min)}`;
  };
  /** Minutes past midnight by the clock on the wall, which is where the week view draws it. */
  const wallMinutes = (t: Time) => {
    const p = parts(t);
    return p.h * 60 + p.min + p.s / 60;
  };
  const dayStart = (key: string) => {
    const [y, m, d] = ymd(key);
    return at(y, m - 1, d);
  };
  const addDays = (key: string, n: number) => {
    const [y, m, d] = ymd(key);
    return day(at(y, m - 1, d + n));
  };
  /** The Monday starting the day's week. */
  const weekStart = (key: string) => addDays(key, -((parts(dayStart(key)).dow + 6) % 7));
  const shiftMonth = (month: string, by: number) => {
    const [y, m] = ymd(month);
    return day(at(y, m - 1 + by, 1)).slice(0, 7);
  };

  /**
   * The month as Monday-first weeks, the first and last filled out with the
   * neighbouring months' days, as a wall calendar shows them.
   */
  const monthWeeks = (month: string): string[][] => {
    const end = addDays(weekStart(addDays(`${shiftMonth(month, 1)}-01`, -1)), 7);
    const weeks: string[][] = [];
    for (let d = weekStart(`${month}-01`); d < end; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
    return weeks;
  };

  /** The time from start to end that falls on each day. */
  const splitByDay = (start: number, end: number) => {
    const out: { day: string; ms: number }[] = [];
    for (let t = start; t < end;) {
      const key = day(t);
      const next = Math.min(end, dayStart(addDays(key, 1)));
      out.push({ day: key, ms: next - t });
      t = next;
    }
    return out;
  };

  /** Pfinder time, shouts and applications per day; open sessions count up to now. */
  const summarize = (sessions: PfinderSession[], shouts: Shout[], apps: Application[], now: number) => {
    const days: Record<string, DaySummary> = {};
    const get = (d: string) => (days[d] ??= { ms: 0, people: {}, shouts: 0, apps: 0 });
    for (const s of sessions) {
      const end = s.ended_at ? Date.parse(s.ended_at) : now;
      for (const part of splitByDay(Date.parse(s.started_at), end)) {
        const d = get(part.day);
        d.ms += part.ms;
        d.people[s.ign] = (d.people[s.ign] ?? 0) + part.ms;
      }
    }
    for (const s of shouts) get(day(s.shouted_at)).shouts++;
    for (const a of apps) get(day(a.submitted_at)).apps++;
    return days;
  };

  /**
   * Sessions' parts on one day for the week view: where to draw them
   * (minutes on the wall clock, 0 to 1440) and how long they really ran
   * (ms; differs on a clock-change day). Sessions that overlap share the
   * column side by side: each takes the first lane free at its start, and
   * `lanes` is how many the day needs.
   */
  const dayBlocks = (sessions: PfinderSession[], key: string, now: number): { blocks: DayBlock[]; lanes: number } => {
    const from = dayStart(key), to = dayStart(addDays(key, 1));
    const found = sessions
      .map(s => {
        const start = Math.max(Date.parse(s.started_at), from);
        const end = Math.min(s.ended_at ? Date.parse(s.ended_at) : now, to);
        const startMin = start === from ? 0 : wallMinutes(start);
        // at least a minute, as an hour repeated at a clock change can put the wall-clock end before the start
        const endMin = end === to ? 1440 : Math.max(wallMinutes(end), startMin + 1);
        return { session: s, startMin, endMin, ms: end - start };
      })
      .filter(p => p.ms > 0)
      .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
    const laneEnds: number[] = [];
    const blocks = found.map(p => {
      let lane = laneEnds.findIndex(end => end <= p.startMin);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = p.endMin;
      return { ...p, lane };
    });
    return { blocks, lanes: Math.max(1, laneEnds.length) };
  };

  return { utc, day, time, wallMinutes, dayStart, addDays, weekStart, shiftMonth, monthWeeks, splitByDay, summarize, dayBlocks };
}

export type CalendarDays = ReturnType<typeof calendarDays>;

// --- Display ----------------------------------------------------------------------

/**
 * Shade step 0 (none) to 5 for a day's pfinder time. Fixed hours rather
 * than relative to the month's busiest day, so a shade means the same thing
 * in every month.
 */
export function shadeStep(ms: number): number {
  const h = ms / 3_600_000;
  if (ms <= 0) return 0;
  return h < 1 ? 1 : h < 2 ? 2 : h < 4 ? 3 : h < 8 ? 4 : 5;
}
export const SHADE_LEGEND = ['under 1h', '1–2h', '2–4h', '4–8h', '8h+'];

export function formatDuration(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`;
}

/** An ISO time from a request body, or null when it's missing or unreadable. */
export function parseTime(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}
