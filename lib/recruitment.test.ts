import { describe, expect, it } from 'vitest';
import {
  addDays, dayBlocks, formatDuration, monthWeeks, nextUtcMidnight, parseDay, parseMonth, shadeStep, shiftMonth,
  splitByUtcDay, summarize, weekStart,
  type PfinderSession, type Shout,
} from './recruitment';

const H = 3_600_000;
const t = (iso: string) => Date.parse(iso);

describe('splitByUtcDay', () => {
  it('keeps a session inside one day whole', () => {
    expect(splitByUtcDay(t('2026-11-01T10:00Z'), t('2026-11-01T12:30Z'))).toEqual([{ day: '2026-11-01', ms: 2.5 * H }]);
  });
  it('splits a session at UTC midnight', () => {
    expect(splitByUtcDay(t('2026-11-01T23:00Z'), t('2026-11-02T01:00Z'))).toEqual([
      { day: '2026-11-01', ms: H }, { day: '2026-11-02', ms: H },
    ]);
  });
  it('returns nothing for an empty span', () => {
    expect(splitByUtcDay(t('2026-11-01T10:00Z'), t('2026-11-01T10:00Z'))).toEqual([]);
  });
});

describe('summarize', () => {
  const s = (id: number, ign: string, start: string, end: string | null): PfinderSession =>
    ({ id, discord_id: String(id), ign, started_at: start, ended_at: end });
  const shout = (at: string): Shout => ({ id: 1, discord_id: '1', ign: 'A', shouted_at: at, slot: 1, note: null });

  it('adds up time per day and per member, counting open sessions to now', () => {
    const days = summarize(
      [s(1, 'A', '2026-11-01T10:00:00Z', '2026-11-01T11:00:00Z'), s(2, 'B', '2026-11-01T10:30:00Z', null)],
      [shout('2026-11-01T12:00:00Z'), shout('2026-11-02T00:00:00Z')],
      t('2026-11-01T12:30Z'),
    );
    expect(days['2026-11-01']).toEqual({ ms: 3 * H, people: { A: H, B: 2 * H }, shouts: 1 });
    expect(days['2026-11-02']).toEqual({ ms: 0, people: {}, shouts: 1 });
  });
});

describe('months', () => {
  it('parses only YYYY-MM', () => {
    expect(parseMonth('2026-11')).toBe('2026-11');
    expect(parseMonth('2026-13')).toBeNull();
    expect(parseMonth('2026-1')).toBeNull();
    expect(parseMonth(null)).toBeNull();
  });
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

describe('weeks', () => {
  it('parses only real days', () => {
    expect(parseDay('2026-11-01')).toBe('2026-11-01');
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-11-1')).toBeNull();
  });
  it('finds the Monday of a week, across a month boundary', () => {
    expect(weekStart('2026-11-01')).toBe('2026-10-26'); // a Sunday
    expect(weekStart('2026-10-26')).toBe('2026-10-26');
    expect(addDays('2026-10-26', 7)).toBe('2026-11-02');
  });
});

describe('dayBlocks', () => {
  const s = (id: number, start: string, end: string | null): PfinderSession =>
    ({ id, discord_id: String(id), ign: `M${id}`, started_at: start, ended_at: end });

  it('clips sessions to the day and gives overlapping ones their own lane', () => {
    const { blocks, lanes } = dayBlocks([
      s(1, '2026-10-31T23:00:00Z', '2026-11-01T01:00:00Z'),
      s(2, '2026-11-01T00:30:00Z', '2026-11-01T02:00:00Z'),
      s(3, '2026-11-01T01:00:00Z', '2026-11-01T03:00:00Z'),
      s(4, '2026-11-02T01:00:00Z', '2026-11-02T03:00:00Z'),
    ], '2026-11-01', t('2026-11-05T00:00Z'));
    expect(blocks.map(b => [b.session.id, b.startMin, b.endMin, b.lane])).toEqual([
      [1, 0, 60, 0], [2, 30, 120, 1], [3, 60, 180, 0],
    ]);
    expect(lanes).toBe(2);
  });

  it('runs an open session up to now', () => {
    const { blocks } = dayBlocks([s(1, '2026-11-01T10:00:00Z', null)], '2026-11-01', t('2026-11-01T10:45Z'));
    expect(blocks[0].endMin - blocks[0].startMin).toBe(45);
  });
});
