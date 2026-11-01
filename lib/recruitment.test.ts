import { describe, expect, it } from 'vitest';
import {
  formatDuration, monthWeeks, nextUtcMidnight, parseMonth, shadeStep, shiftMonth, splitByUtcDay, summarize,
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
  it('lays a month out in Monday-first weeks', () => {
    // 1 November 2026 is a Sunday
    const weeks = monthWeeks('2026-11');
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks.at(-1)).toEqual(['2026-11-30', null, null, null, null, null, null]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
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
