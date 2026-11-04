import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  calendarDays, formatDuration, nextUtcMidnight, shadeStep, utcDay,
  type Application, type PfinderSession, type Shout,
} from './recruitment';

const H = 3_600_000;
const t = (iso: string) => Date.parse(iso);

// The zone is read when a helper runs, so these follow the TZ set below
const {
  day: localDay, time: localTime, addDays, dayBlocks, dayStart, monthWeeks, shiftMonth, splitByDay, summarize, wallMinutes, weekStart,
} = calendarDays(false);
const U = calendarDays(true);

// The calendar works in the zone the code runs in. Pin one with a clock
// change in range: Los Angeles falls back from PDT (-7) to PST (-8) at 02:00
// on 1 November 2026, making that local day 25 hours long. Restored after,
// since vitest reuses the process for other files.
const savedTz = process.env.TZ;
beforeAll(() => { process.env.TZ = 'America/Los_Angeles'; });
afterAll(() => { if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz; });

describe('local days', () => {
  it('reads days and times in the local zone', () => {
    expect(localDay(t('2026-10-30T06:00Z'))).toBe('2026-10-29'); // 23:00 PDT
    expect(localTime(t('2026-10-30T06:00Z'))).toBe('23:00');
    expect(utcDay(t('2026-10-30T06:00Z'))).toBe('2026-10-30');
  });
  it('starts a day at local midnight', () => {
    expect(dayStart('2026-10-31')).toBe(t('2026-10-31T07:00Z'));
    expect(dayStart('2026-11-02')).toBe(t('2026-11-02T08:00Z'));
  });
  it('steps days by the calendar, across the clock change', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(dayStart('2026-11-02') - dayStart('2026-11-01')).toBe(25 * H);
  });
  it('finds the Monday of a week, across a month boundary', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // a Sunday
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
  });
  it('puts times on the wall clock', () => {
    expect(wallMinutes(t('2026-10-31T16:30Z'))).toBe(9 * 60 + 30); // 09:30 PDT
  });
});

describe('UTC days', () => {
  it('reads the same moments by UTC instead, whatever the local zone', () => {
    expect(U.day(t('2026-10-30T06:00Z'))).toBe('2026-10-30');
    expect(U.time(t('2026-10-30T06:00Z'))).toBe('06:00');
    expect(U.dayStart('2026-11-01')).toBe(t('2026-11-01T00:00Z'));
    expect(U.dayStart('2026-11-02') - U.dayStart('2026-11-01')).toBe(24 * H);
    expect(U.splitByDay(t('2026-10-30T23:00Z'), t('2026-10-31T01:00Z')).map(p => p.day)).toEqual(['2026-10-30', '2026-10-31']);
  });
});

describe('splitByDay', () => {
  it('keeps a session inside one day whole', () => {
    expect(splitByDay(t('2026-10-29T17:00Z'), t('2026-10-29T19:30Z'))).toEqual([{ day: '2026-10-29', ms: 2.5 * H }]);
  });
  it('splits a session at local midnight', () => {
    // 22:00 to 02:00 PDT
    expect(splitByDay(t('2026-10-30T05:00Z'), t('2026-10-30T09:00Z'))).toEqual([
      { day: '2026-10-29', ms: 2 * H }, { day: '2026-10-30', ms: 2 * H },
    ]);
  });
  it('counts the real time on a 25-hour day', () => {
    const parts = splitByDay(dayStart('2026-11-01'), dayStart('2026-11-02'));
    expect(parts).toEqual([{ day: '2026-11-01', ms: 25 * H }]);
  });
});

describe('summarize', () => {
  const s = (id: number, ign: string, start: string, end: string | null): PfinderSession =>
    ({ id, discord_id: String(id), ign, started_at: start, ended_at: end });
  const shout = (at: string): Shout => ({ id: 1, discord_id: '1', ign: 'A', shouted_at: at, slot: 1 });
  const app = (at: string): Application => ({ id: 1, ign: 'New', status: 'pending', submitted_at: at });

  it('adds up time per local day and per member, counting open sessions to now', () => {
    const days = summarize(
      [s(1, 'A', '2026-10-29T17:00:00Z', '2026-10-29T18:00:00Z'), s(2, 'B', '2026-10-29T17:30:00Z', null)],
      // 23:30 PDT on the 29th, and 00:30 PDT on the 30th though both are the 30th in UTC
      [shout('2026-10-30T06:30:00Z'), shout('2026-10-30T07:30:00Z')],
      [app('2026-10-30T06:45:00Z')],
      t('2026-10-29T19:30Z'),
    );
    expect(days['2026-10-29']).toEqual({ ms: 3 * H, people: { A: H, B: 2 * H }, shouts: 1, apps: 1 });
    expect(days['2026-10-30']).toEqual({ ms: 0, people: {}, shouts: 1, apps: 0 });
  });
});

describe('months', () => {
  it('shifts across years', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
  it('lays a month out in Monday-first weeks, filled from the months either side', () => {
    // 1 November 2026 is a Sunday, the 30th a Monday
    const weeks = monthWeeks('2026-11');
    expect(weeks[0]).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(weeks.at(-1)).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
    expect(weeks).toHaveLength(6);
    // a month that starts on a Monday gets no days from the month before
    expect(monthWeeks('2027-02')[0][0]).toBe('2027-02-01');
  });
});

describe('dayBlocks', () => {
  const s = (id: number, start: string, end: string | null): PfinderSession =>
    ({ id, discord_id: String(id), ign: `M${id}`, started_at: start, ended_at: end });

  it('clips sessions to the local day and gives overlapping ones their own lane', () => {
    // times in PDT: 23:00-01:00, 00:30-02:00, 01:00-03:00 on the 30th, and one on the 31st
    const { blocks, lanes } = dayBlocks([
      s(1, '2026-10-30T06:00:00Z', '2026-10-30T08:00:00Z'),
      s(2, '2026-10-30T07:30:00Z', '2026-10-30T09:00:00Z'),
      s(3, '2026-10-30T08:00:00Z', '2026-10-30T10:00:00Z'),
      s(4, '2026-10-31T08:00:00Z', '2026-10-31T10:00:00Z'),
    ], '2026-10-30', t('2026-11-05T00:00Z'));
    expect(blocks.map(b => [b.session.id, b.startMin, b.endMin, b.lane])).toEqual([
      [1, 0, 60, 0], [2, 30, 120, 1], [3, 60, 180, 0],
    ]);
    expect(lanes).toBe(2);
  });

  it('runs an open session up to now', () => {
    const { blocks } = dayBlocks([s(1, '2026-10-29T17:00:00Z', null)], '2026-10-29', t('2026-10-29T17:45Z'));
    expect(blocks[0].ms).toBe(45 * 60_000);
  });

  it('draws by the wall clock but counts the real time on a clock-change day', () => {
    // 00:00 PDT to 03:00 PST: four real hours, three on the wall
    const { blocks } = dayBlocks([s(1, '2026-11-01T07:00:00Z', '2026-11-01T11:00:00Z')], '2026-11-01', t('2026-11-05T00:00Z'));
    expect([blocks[0].startMin, blocks[0].endMin, blocks[0].ms]).toEqual([0, 180, 4 * H]);
  });
});

describe('display', () => {
  it('shades by fixed hours', () => {
    expect([0, 0.5, 1, 3, 4, 9].map(h => shadeStep(h * H))).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('formats durations', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(2 * H)).toBe('2h');
    expect(formatDuration(2 * H + 5 * 60_000)).toBe('2h 5m');
  });
  it('finds the next UTC midnight', () => {
    expect(nextUtcMidnight(t('2026-11-01T23:59Z'))).toBe(t('2026-11-02T00:00Z'));
  });
});
