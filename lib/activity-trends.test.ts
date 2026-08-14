import { describe, it, expect } from 'vitest';
import {
  isMetric, isRange, isValidTimeZone, bucketFor, intervalFor,
  buildHeatmapGrid, bestWindow, playtimeQuery, presenceQuery, eventQuery,
  presenceHeatmapQuery, slotOccurrenceQuery, EXPECTED_TICKS_PER_HOUR, EPOCH_FLOOR,
  snapshotQuery, latestPointQuery, isSnapshotMetric, SNAPSHOT_COLUMNS,
  isAveragedMetric, unitFor, headlineQuery, eventHeatmapQuery,
  usesHourlyCounters, hourlyCounterQuery, hourlyCounterHeatmapQuery, RANGES,
  presenceOccurrenceQuery, presenceCoverageQuery,
  scopeFromParams, scopeFilter, EXEC_RANK_NAMES,
} from './activity-trends';

describe('parameter validation', () => {
  it('accepts known metrics and ranges', () => {
    expect(isMetric('presence')).toBe(true);
    expect(isMetric('captures')).toBe(true);
    expect(isMetric('wars')).toBe(true);
    expect(isMetric('raid_clears')).toBe(true);
    expect(isMetric('territories')).toBe(false);
    expect(isMetric(null)).toBe(false);
    expect(isRange('90d')).toBe(true);
    expect(isRange('2y')).toBe(false);
  });

  it('accepts real IANA zones and rejects junk', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/New_York')).toBe(true);
    expect(isValidTimeZone('Australia/Sydney')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone("UTC'; DROP TABLE presence_ticks; --")).toBe(false);
  });
});

describe('bucketFor', () => {
  it('never gives a snapshot metric an hourly bucket beyond the sampled window', () => {
    // Past 7 days these read playtime_daily, which is keyed by DATE — an
    // hourly bucket there would imply precision the daily snapshot lacks.
    for (const metric of ['playtime', 'wars', 'raid_clears'] as const) {
      for (const range of ['30d', '90d'] as const) {
        expect(bucketFor(metric, range)).toBe('day');
      }
      expect(bucketFor(metric, '1y')).toBe('week');
      expect(bucketFor(metric, 'all')).toBe('week');
    }
  });

  it('scales other metrics with the range', () => {
    expect(bucketFor('presence', '24h')).toBe('hour');
    expect(bucketFor('presence', '7d')).toBe('hour');
    expect(bucketFor('captures', '30d')).toBe('day');
    expect(bucketFor('captures', '1y')).toBe('week');
    expect(bucketFor('raids', 'all')).toBe('week');
  });
});

describe('intervalFor', () => {
  it('maps ranges to Postgres intervals', () => {
    expect(intervalFor('24h')).toBe('1 days');
    expect(intervalFor('7d')).toBe('7 days');
    expect(intervalFor('1y')).toBe('365 days');
  });

  it('returns null for the unbounded range', () => {
    expect(intervalFor('all')).toBeNull();
  });
});

describe('query builders', () => {
  it('derives both ends of the window from the database clock', () => {
    // Node computing the start while Postgres computes the end put the two
    // ends of one window on two clocks; every window is now NOW()-relative.
    for (const q of [playtimeQuery('day', '30d'), presenceQuery('hour', '24h', 'UTC'),
                     eventQuery('captures', 'day', '30d', 'UTC'),
                     slotOccurrenceQuery('30d', 'UTC')]) {
      expect(q.text).toContain('NOW()');
      expect(q.values.some((v) => v instanceof Date)).toBe(false);
    }
  });

  it('anchors playtime to UTC days rather than the session timezone', () => {
    // playtime_daily.day is a UTC date; inheriting the session zone would
    // shift "today" by the server's offset.
    const q = playtimeQuery('day', '30d');
    expect(q.text).toContain("AT TIME ZONE 'UTC'");
    expect(q.text).not.toContain('NOW()::timestamp');
  });

  it('passes the timezone as a bind parameter, never inlined', () => {
    const tz = "America/New_York'; DROP TABLE x; --";
    const q = presenceQuery('hour', '7d', tz);
    expect(q.text).not.toContain('DROP TABLE');
    expect(q.values).toContain(tz);
  });

  it('omits the uuid filter and its parameter when guild-wide', () => {
    const guild = presenceQuery('day', '30d', 'UTC');
    expect(guild.text).not.toContain('p.uuid =');
    expect(guild.values).toHaveLength(3);

    const member = presenceQuery('day', '30d', 'UTC', { uuid: 'abc' });
    expect(member.text).toContain('p.uuid = $4::uuid');
    expect(member.values[3]).toBe('abc');
  });

  it('reads guild-wide presence from the guild count, not from summed members', () => {
    // Members with restrictions.online_status report their per-member flag as
    // false while still counting toward the guild's own total (measured: 10 of
    // 150). Summing presence_hourly for a guild-wide series would drop them.
    const guild = presenceQuery('day', '30d', 'UTC');
    expect(guild.text).toContain('SUM(c.online_avg)');
    expect(guild.text).not.toContain('SUM(p.minutes)');

    const guildHeat = presenceHeatmapQuery('30d', 'UTC');
    expect(guildHeat.text).toContain('SUM(c.online_avg)');
    expect(guildHeat.text).not.toContain('SUM(p.minutes)');
  });

  it('falls back to attributed per-member data only when a uuid is given', () => {
    // A single member cannot be served by the aggregate, so this path is the
    // attributable subset by construction.
    const member = presenceQuery('day', '30d', 'UTC', { uuid: 'abc' });
    expect(member.text).toContain('SUM(p.minutes)');

    const memberHeat = presenceHeatmapQuery('30d', 'UTC', { uuid: 'abc' });
    expect(memberHeat.text).toContain('SUM(p.minutes)');
    expect(memberHeat.text).toContain('p.uuid = $3::uuid');
  });

  it('reports the attributable share so hidden members are visible, not silent', () => {
    expect(presenceQuery('day', '30d', 'UTC').text).toContain('attributed_sum');
  });

  it('numbers the playtime uuid parameter correctly', () => {
    const q = playtimeQuery('day', '30d', { uuid: 'abc' });
    expect(q.text).toContain('p.uuid = $3::uuid');
    expect(q.values).toEqual(['day', '30 days', 'abc']);
  });

  it('binds the event kind rather than interpolating the metric', () => {
    const q = eventQuery('captures', 'day', '30d', 'UTC');
    expect(q.values).toEqual(['day', '30 days', 'UTC', 'capture']);
    expect(q.text).toContain('e.kind = $4');
  });

  it('falls back to the epoch floor for unbounded ranges', () => {
    // A null interval makes NOW() - NULL null, which COALESCE catches.
    expect(playtimeQuery('week', 'all').values[1]).toBeNull();
    expect(playtimeQuery('week', 'all').text).toContain(EPOCH_FLOOR);
    expect(presenceHeatmapQuery('all', 'UTC').values[0]).toBeNull();
    expect(presenceHeatmapQuery('all', 'UTC').text).toContain(EPOCH_FLOOR);
  });

  it('measures coverage against the expected tick rate', () => {
    expect(presenceQuery('hour', '24h', 'UTC').text)
      .toContain(`* ${EXPECTED_TICKS_PER_HOUR}`);
  });

  it('gap-fills so missing buckets arrive as zeros', () => {
    for (const q of [playtimeQuery('day', '30d'), presenceQuery('hour', '24h', 'UTC'),
                     eventQuery('raids', 'day', '30d', 'UTC')]) {
      expect(q.text).toContain('generate_series');
      expect(q.text).toContain('LEFT JOIN');
    }
  });
});

describe('snapshot counter metrics', () => {
  it('reads each metric from its own playtime_daily column', () => {
    expect(snapshotQuery('wars', 'day', '30d').text).toContain('SUM(p.wars)');
    expect(snapshotQuery('raids', 'day', '30d').text).toContain('SUM(p.raids)');
    expect(playtimeQuery('day', '30d').text).toContain('SUM(p.hours)');
  });

  it('refuses a column outside the allowlist', () => {
    // The column cannot be a bind parameter, so the allowlist is the guard.
    expect(() => snapshotQuery('hours; DROP TABLE playtime_daily' as never, 'day', '30d'))
      .toThrow(/unknown column/i);
  });

  it('maps every snapshot metric to a real column', () => {
    expect(SNAPSHOT_COLUMNS.playtime).toBe('hours');
    expect(SNAPSHOT_COLUMNS.wars).toBe('wars');
    expect(SNAPSHOT_COLUMNS.raid_clears).toBe('raids');
    expect(isSnapshotMetric('captures')).toBe(false);
    expect(isSnapshotMetric('presence')).toBe(false);
  });
});

describe('averaged metrics', () => {
  it('reports playtime as average concurrent players, not a sum of hours', () => {
    // "360 hours" is the same number for 15 players all day or 360 for an
    // hour; dividing by the hours in the bucket makes it a figure you can
    // picture.
    const q = playtimeQuery('day', '30d');
    expect(q.text).toContain('NULLIF(COUNT(DISTINCT p.day) * 24, 0)');
    expect(isAveragedMetric('playtime')).toBe(true);
    expect(unitFor('playtime')).toBe('avg online');
  });

  it('averages presence per hour rather than summing member-hours', () => {
    const q = presenceQuery('day', '30d', 'UTC');
    expect(q.text).toContain('AVG(c.online_avg)');
    expect(isAveragedMetric('presence')).toBe(true);
  });

  it('leaves counted metrics as sums', () => {
    expect(snapshotQuery('wars', 'day', '30d').text).toContain('SUM(p.wars)::float8 AS value');
    expect(isAveragedMetric('wars')).toBe(false);
    expect(isAveragedMetric('captures')).toBe(false);
  });

  it('keeps the underlying total available alongside the average', () => {
    expect(playtimeQuery('day', '30d').text).toContain('AS raw_total');
    expect(presenceQuery('day', '30d', 'UTC').text).toContain('AS raw_total');
  });

  it('per-member series stay in hours, since one member has no concurrency', () => {
    // "0.3 average concurrent players" for one person is the share of the
    // window they were online — true, and not how anyone reads it.
    expect(unitFor('presence', { uuid: 'abc' })).toBe('hours online');
    expect(unitFor('playtime', { uuid: 'abc' })).toBe('hours played');
    expect(unitFor('presence')).toBe('avg online');
    expect(unitFor('playtime')).toBe('avg online');
    expect(isAveragedMetric('playtime', { uuid: 'abc' })).toBe(false);
    expect(isAveragedMetric('playtime')).toBe(true);
  });

  it('sums a member\'s hours instead of dividing them into a ratio', () => {
    expect(playtimeQuery('day', '30d', { uuid: 'abc' }).text).not.toContain('NULLIF(COUNT(DISTINCT p.day)');
    expect(playtimeQuery('day', '30d', { uuid: 'abc' }).text).toContain('SUM(p.hours)::float8 AS value');
    expect(headlineQuery('playtime', '30d', { uuid: 'abc' })!.text)
      .not.toContain('NULLIF(COUNT(DISTINCT p.day)');
  });
});

describe('headlineQuery', () => {
  it('computes the window figure with the same expression for both windows', () => {
    // A delta between an average and a sum would be nonsense.
    const now = headlineQuery('playtime', '30d')!;
    const prev = headlineQuery('playtime', '30d', undefined, true)!;
    expect(now.text).toContain('NULLIF(COUNT(DISTINCT p.day) * 24, 0)');
    expect(prev.text).toContain('NULLIF(COUNT(DISTINCT p.day) * 24, 0)');
    expect(prev.text).toContain('NOW() - 2 * $1::interval');
  });

  it('compares daily-sourced metrics on date boundaries, matching the series', () => {
    // playtime_daily.day is a DATE, so a timestamp cutoff mid-way through the
    // boundary day excludes it — which zeroed a 24-hour window outright and
    // quietly dropped one day in thirty from the longer ones. (24h now reads
    // the hourly samples instead, so 30d is the shortest daily-sourced range.)
    const q = headlineQuery('playtime', '30d')!;
    expect(q.text).toContain("AT TIME ZONE 'UTC')::date");
    expect(q.text).not.toContain('p.day::timestamptz');
  });

  it('bounds the previous snapshot window on both sides', () => {
    const prev = headlineQuery('wars', '30d', undefined, true)!;
    expect(prev.text).toContain('p.day >=');
    expect(prev.text).toContain('p.day <');
  });

  it('stops the snapshot series at the last day that has data', () => {
    // Today has no snapshot until 00:01 tomorrow, so running to now appends a
    // permanently-zero bucket that reads as a nightly collapse.
    expect(playtimeQuery('day', '30d').text)
      .toContain('SELECT MAX(day) FROM playtime_daily');
    expect(playtimeQuery('day', '30d').text).toContain('LEAST(');
  });

  it('has no previous window for the unbounded range', () => {
    expect(headlineQuery('playtime', 'all', undefined, true)).toBeNull();
    expect(headlineQuery('playtime', 'all')).not.toBeNull();
  });

  it('counts events rather than averaging them', () => {
    const q = headlineQuery('captures', '30d')!;
    expect(q.text).toContain('COUNT(*)::float8');
    expect(q.values).toContain('capture');
  });
});

describe('hourly counter samples', () => {
  it('does not serve any range from the counters', () => {
    // Wynncraft flushes the cumulative counters in bursts: measured against
    // the presence sampler, 9 of 13 members online for a whole hour recorded
    // zero playtime in it, while others jumped 3-7 hours inside one hour. The
    // counter records when the server flushed, not when the playing happened.
    for (const range of RANGES) {
      expect(usesHourlyCounters('playtime', range)).toBe(false);
      expect(usesHourlyCounters('wars', range)).toBe(false);
    }
  });

  it('still exposes the heatmap builder for the inert path', () => {
    // Not wired to a route: the heatmap endpoint rejects snapshot metrics
    // outright rather than serve a grid built from burst-flushed counters.
    expect(hourlyCounterHeatmapQuery('hours', '30d', 'UTC').text).toContain('member_counters_hourly');
  });

  it('keeps snapshot metrics on day and week buckets', () => {
    expect(bucketFor('playtime', '24h')).toBe('day');
    expect(bucketFor('wars', '7d')).toBe('day');
    expect(bucketFor('playtime', '1y')).toBe('week');
  });

  it('only trusts deltas from consecutive hours', () => {
    // A wider span means the sampler was down; the activity inside it could
    // have happened at any hour, so crediting the closing hour invents a spike.
    const q = hourlyCounterQuery('hours', '24h', 'UTC');
    expect(q.text).toContain("span = interval '1 hour'");
    expect(q.text).toContain('GREATEST(raw_delta, 0)');
  });

  it('reaches one hour before the window so the first bucket has a predecessor', () => {
    expect(hourlyCounterQuery('hours', '24h', 'UTC').text)
      .toContain("w.from_ts - interval '1 hour'");
  });

  it('refuses a column outside the allowlist', () => {
    expect(() => hourlyCounterQuery('playtime; DROP TABLE x' as never, '24h', 'UTC'))
      .toThrow(/unknown column/i);
    expect(() => hourlyCounterHeatmapQuery('nope' as never, '24h', 'UTC'))
      .toThrow(/unknown column/i);
  });

  it('still averages playtime and sums counters if a caller opts in', () => {
    // The path is inert but intact: passing hourly=true is all it takes to use
    // it again should Wynncraft ever flush the counters continuously.
    expect(headlineQuery('playtime', '24h', undefined, false, true)!.text)
      .toContain('NULLIF(COUNT(DISTINCT hour), 0)');
    expect(headlineQuery('wars', '24h', undefined, false, true)!.text)
      .toContain('COALESCE(SUM(delta), 0)');
  });
});

describe('participation weighting', () => {
  it('counts raids by people, since a raid is 1 to 4 players', () => {
    // 13 pct of logged raids are solo and 72 pct are four-strong, so counting
    // rows would treat a solo clear and a full party as equal work.
    expect(eventQuery('raids', 'day', '30d', 'UTC').text).toContain('SUM(e.participants)');
    expect(eventHeatmapQuery('raids', '30d', 'UTC').text).toContain('SUM(e.participants)');
    expect(headlineQuery('raids', '30d')!.text).toContain('SUM(e.participants)');
  });

  it('leaves captures and snipes as event counts', () => {
    // Captures have no roster; snipe parties are near-uniform at 4-6.
    for (const q of [eventQuery('captures', 'day', '30d', 'UTC'),
                     eventQuery('snipes', 'day', '30d', 'UTC'),
                     eventHeatmapQuery('captures', '30d', 'UTC')]) {
      expect(q.text).toContain('COUNT(*)::float8');
      expect(q.text).not.toContain('SUM(e.participants)');
    }
  });

  it('keeps the raw event count so average party size stays recoverable', () => {
    expect(eventQuery('raids', 'day', '30d', 'UTC').text).toContain('COUNT(*)::float8 AS raw_total');
  });

  it('puts both raid metrics in the same per-person unit', () => {
    expect(unitFor('raids')).toBe('player-raids');
    expect(unitFor('raid_clears')).toBe('player-raids');
  });
});

describe('latestPointQuery', () => {
  it('points each metric family at the table that holds its history', () => {
    expect(latestPointQuery('wars').text).toContain('playtime_daily');
    expect(latestPointQuery('presence').text).toContain('presence_coverage_hourly');

    const events = latestPointQuery('captures');
    expect(events.text).toContain('guild_activity_events');
    expect(events.values).toEqual(['capture']);   // bound, not interpolated
  });
});

describe('presence as the short-range source for players online', () => {
  it('picks whichever source shows more structure, not full coverage', () => {
    // Requiring presence to span the window leaves the worst chart in place
    // while waiting: a 24-hour window on daily data is a single bucket.
    const q = presenceCoverageQuery('24h');
    expect(q.text).toContain('presence_coverage_hourly');
    expect(q.text).toContain('playtime_daily');
    expect(q.text).toContain('ticks_observed > 0');
    expect(q.text).toContain('p.n >= 2 AND p.n >= d.n');
    expect(q.values).toEqual(['1 days']);
  });

  it('measures the same quantity in the same unit as the daily source', () => {
    // Both are average concurrent players, which is what makes substituting
    // one for the other legitimate rather than a unit change.
    expect(unitFor('playtime')).toBe(unitFor('presence'));
    expect(isAveragedMetric('playtime')).toBe(true);
    expect(isAveragedMetric('presence')).toBe(true);
  });
});

describe('member scope', () => {
  it('resolves cohort tokens to the ranks they cover', () => {
    expect(scopeFromParams(undefined, 'exec')).toEqual({
      ranks: EXEC_RANK_NAMES, label: 'Executives',
    });
    expect(scopeFromParams(undefined, 'non-exec'))
      .toEqual({ notRanks: EXEC_RANK_NAMES, label: 'Non-executives' });
    expect(scopeFromParams(undefined, 'rank:Manatee')).toEqual({
      ranks: ['Manatee'], label: 'Manatee',
    });
  });

  it('defines non-exec by negation so no rank can be forgotten', () => {
    // An explicit "other ranks" list silently dropped Barracuda, which 45
    // members hold: it appeared in neither cohort and took two thirds of guild
    // playtime with it.
    const values: unknown[] = [];
    const sql = scopeFilter(scopeFromParams(undefined, 'non-exec'), 'p', values);
    expect(sql).toContain('NOT (dl.rank = ANY(');
    expect(values[0]).toEqual(EXEC_RANK_NAMES);
  });

  it('accepts any named rank but rejects an empty or unknown token', () => {
    // A rank the constants never listed still resolves — the roster is the
    // authority, not the array. An unparseable token must not silently widen
    // the query back to the whole guild.
    expect(scopeFromParams(undefined, 'rank:Barracuda')).toEqual({
      ranks: ['Barracuda'], label: 'Barracuda',
    });
    expect(scopeFromParams(undefined, 'rank:')).toBeUndefined();
    expect(scopeFromParams(undefined, 'nonsense')).toBeUndefined();
  });

  it('prefers an explicit member over a cohort', () => {
    expect(scopeFromParams('abc', 'exec')).toEqual({ uuid: 'abc' });
  });

  it('binds ranks as an array parameter, never inlined', () => {
    const values: unknown[] = [];
    const sql = scopeFilter({ ranks: ["Narwhal'; DROP TABLE x; --"] }, 'p', values);
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).toContain('rank = ANY($1::text[])');
    expect(values[0]).toEqual(["Narwhal'; DROP TABLE x; --"]);
  });

  it('adds nothing to a guild-wide query', () => {
    const values: unknown[] = [];
    expect(scopeFilter(undefined, 'p', values)).toBe('');
    expect(values).toHaveLength(0);
  });

  it('keeps averaging for a rank cohort but not for one member', () => {
    // A cohort is still several people, so "average concurrent" is readable.
    expect(isAveragedMetric('playtime', { ranks: ['Narwhal'] })).toBe(true);
    expect(isAveragedMetric('playtime', { uuid: 'abc' })).toBe(false);
    expect(unitFor('playtime', { ranks: ['Narwhal'] })).toBe('avg online');
    expect(unitFor('playtime', { uuid: 'abc' })).toBe('hours played');
  });
});

describe('heatmap denominators', () => {
  it('divides presence by sampled hours, not calendar hours', () => {
    // Dividing presence by the calendar scales every cell down by the share of
    // time the sampler was not running: the same four hours of data read 3.0
    // over 30 days and 0.3 over a year.
    const q = presenceOccurrenceQuery('1y', 'UTC');
    expect(q.text).toContain('presence_coverage_hourly');
    expect(q.text).toContain('ticks_observed > 0');
    expect(q.text).not.toContain('generate_series');
  });

  it('divides events by the calendar, where an empty slot is a real zero', () => {
    expect(slotOccurrenceQuery('1y', 'UTC').text).toContain('generate_series');
  });
});

describe('buildHeatmapGrid', () => {
  it('returns every slot even when nothing happened there', () => {
    const cells = buildHeatmapGrid([{ dow: 2, hour: 20, total: 10 }],
                                   [{ dow: 2, hour: 20, occurrences: 5 }]);
    expect(cells).toHaveLength(7 * 24);
    const busy = cells.find((c) => c.dow === 2 && c.hour === 20)!;
    expect(busy).toMatchObject({ total: 10, occurrences: 5, average: 2 });
    const quiet = cells.find((c) => c.dow === 0 && c.hour === 3)!;
    expect(quiet).toMatchObject({ total: 0, occurrences: 0, average: 0 });
  });

  it('averages by how often the slot occurred, not by raw total', () => {
    // A 30-day window holds five Mondays but only four Tuesdays; equal totals
    // must not read as equal activity.
    const cells = buildHeatmapGrid(
      [{ dow: 0, hour: 20, total: 20 }, { dow: 1, hour: 20, total: 20 }],
      [{ dow: 0, hour: 20, occurrences: 5 }, { dow: 1, hour: 20, occurrences: 4 }],
    );
    expect(cells.find((c) => c.dow === 0 && c.hour === 20)!.average).toBe(4);
    expect(cells.find((c) => c.dow === 1 && c.hour === 20)!.average).toBe(5);
  });

  it('never divides by a zero occurrence count', () => {
    const cells = buildHeatmapGrid([{ dow: 3, hour: 4, total: 7 }], []);
    expect(cells.find((c) => c.dow === 3 && c.hour === 4)!.average).toBe(0);
  });
});

describe('bestWindow', () => {
  const flat = () => {
    const cells = [];
    for (let dow = 0; dow < 7; dow++)
      for (let hour = 0; hour < 24; hour++)
        cells.push({ dow, hour, total: 0, occurrences: 1, average: 0 });
    return cells;
  };

  it('finds the busiest contiguous block', () => {
    const cells = flat();
    for (const c of cells) if (c.hour === 19 || c.hour === 20) c.average = 10;
    expect(bestWindow(cells, 2).startHour).toBe(19);
  });

  it('wraps around midnight', () => {
    const cells = flat();
    for (const c of cells) if (c.hour === 23 || c.hour === 0) c.average = 10;
    expect(bestWindow(cells, 2).startHour).toBe(23);
  });
});
