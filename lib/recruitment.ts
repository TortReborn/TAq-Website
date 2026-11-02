/**
 * Recruitment tracking (TAQ-140): pfinder clock-in sessions and the guild's
 * shouts. Days are UTC throughout, the same days the shout limit resets on.
 * Client-safe; the database side is lib/recruitment-db.ts.
 */

export const SHOUTS_PER_DAY = 3;
/** A session longer than this is a forgotten clock-out, not recruiting. */
export const MAX_SESSION_HOURS = 24;
const DAY = 86_400_000;

export interface PfinderSession { id: number; discord_id: string; ign: string; started_at: string; ended_at: string | null }
export interface Shout { id: number; discord_id: string; ign: string; shouted_at: string; slot: number; note: string | null }

export interface DaySummary {
  ms: number;
  /** pfinder time per member (by IGN) that day */
  people: Record<string, number>;
  shouts: number;
}

export const utcDay = (t: string | number | Date) => new Date(t).toISOString().slice(0, 10);

/** The time from start to end that falls on each UTC day. */
export function splitByUtcDay(start: number, end: number): { day: string; ms: number }[] {
  const out: { day: string; ms: number }[] = [];
  for (let t = start; t < end;) {
    const next = Math.min(end, (Math.floor(t / DAY) + 1) * DAY);
    out.push({ day: utcDay(t), ms: next - t });
    t = next;
  }
  return out;
}

/** Pfinder time and shouts per UTC day; open sessions count up to now. */
export function summarize(sessions: PfinderSession[], shouts: Shout[], now: number): Record<string, DaySummary> {
  const days: Record<string, DaySummary> = {};
  const day = (d: string) => (days[d] ??= { ms: 0, people: {}, shouts: 0 });
  for (const s of sessions) {
    const end = s.ended_at ? Date.parse(s.ended_at) : now;
    for (const part of splitByUtcDay(Date.parse(s.started_at), end)) {
      const d = day(part.day);
      d.ms += part.ms;
      d.people[s.ign] = (d.people[s.ign] ?? 0) + part.ms;
    }
  }
  for (const s of shouts) day(utcDay(s.shouted_at)).shouts++;
  return days;
}

/** 'YYYY-MM' if it is one, else null. */
export function parseMonth(v: string | null | undefined): string | null {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
}

/** 'YYYY-MM-DD' if it is a real day, else null. */
export function parseDay(v: string | null | undefined): string | null {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) && utcDay(`${v}T00:00:00Z`) === v ? v : null;
}

export const addDays = (day: string, n: number) => utcDay(Date.parse(`${day}T00:00:00Z`) + n * DAY);

/** The Monday starting day's week. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((dow + 6) % 7));
}

/** The longest range the page asks for at once: a month view's 31 days, with room to spare. */
export const MAX_RANGE_DAYS = 62;

export interface DayBlock { session: PfinderSession; startMin: number; endMin: number; lane: number }

/**
 * Sessions' parts on one UTC day, in minutes from midnight, for the week
 * view. Sessions that overlap in time share the column side by side: each
 * takes the first lane free at its start, and `lanes` is how many the day needs.
 */
export function dayBlocks(sessions: PfinderSession[], day: string, now: number): { blocks: DayBlock[]; lanes: number } {
  const dayStart = Date.parse(`${day}T00:00:00Z`);
  const parts = sessions
    .map(s => {
      const start = Math.max(Date.parse(s.started_at), dayStart);
      const end = Math.min(s.ended_at ? Date.parse(s.ended_at) : now, dayStart + DAY);
      return { session: s, startMin: (start - dayStart) / 60_000, endMin: (end - dayStart) / 60_000 };
    })
    .filter(p => p.endMin > p.startMin)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const laneEnds: number[] = [];
  const blocks = parts.map(p => {
    let lane = laneEnds.findIndex(end => end <= p.startMin);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = p.endMin;
    return { ...p, lane };
  });
  return { blocks, lanes: Math.max(1, laneEnds.length) };
}

/**
 * The month as Monday-first weeks, the first and last filled out with the
 * neighbouring months' days, as a wall calendar shows them.
 */
export function monthWeeks(month: string): string[][] {
  const { end } = monthRange(month);
  const first = weekStart(`${month}-01`);
  const last = addDays(weekStart(utcDay(end.getTime() - DAY)), 7);
  const weeks: string[][] = [];
  for (let d = first; d < last; d = addDays(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  return weeks;
}

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

/** 'HH:MM' in UTC */
export const utcTime = (t: string | number | Date) => new Date(t).toISOString().slice(11, 16);

export const nextUtcMidnight = (now: number) => (Math.floor(now / DAY) + 1) * DAY;

/** An ISO time from a request body, or null when it's missing or unreadable. */
export function parseTime(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}
