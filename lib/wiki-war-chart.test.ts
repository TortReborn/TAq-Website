import { describe, expect, it } from 'vitest';
import { clipWarChartEnd, weightedWeekMean, WAR_CHART_WEEK_MS } from './wiki-embeds';

/**
 * The war chart plots how much ground each guild held, week by week. It used to
 * plot how much each took from the other, which could not say anything:
 * territory is conserved, so the two counts differ only by the change in what
 * each side ends up holding. Five of the six war pages drew one line twice
 * (r >= 0.9958), and the KongoBoys campaign that ended a five-year neutrality
 * plotted as 3,837 against 4,034 — near parity for an annihilation.
 *
 * The series itself is computed in SQL against 3.5M rows and is exercised by
 * scripts rather than here. What is pinned below are the two pure pieces
 * either side of it, both of which are off-by-one traps.
 */
describe('clipWarChartEnd', () => {
  it('leaves a window that ends inside the log alone', () => {
    expect(clipWarChartEnd('2024-02-13', '2026-09-09')).toEqual({
      end: '2024-02-13',
      truncatedTo: null,
    });
  });

  it('draws the last logged day in full rather than stopping at its start', () => {
    // The bound is exclusive. Clipping to the last logged day itself would
    // silently drop that day's fighting from the final bucket.
    expect(clipWarChartEnd('2026-09-16', '2026-09-09')).toEqual({
      end: '2026-09-10',
      truncatedTo: '2026-09-10',
    });
  });

  it('does not clip a window ending exactly on the last logged day', () => {
    expect(clipWarChartEnd('2026-09-09', '2026-09-09').truncatedTo).toBeNull();
  });

  it('crosses a month boundary correctly', () => {
    expect(clipWarChartEnd('2026-10-01', '2026-09-30').end).toBe('2026-10-01');
  });

  it('leaves the window alone when the log is empty', () => {
    expect(clipWarChartEnd('2024-02-13', null)).toEqual({
      end: '2024-02-13',
      truncatedTo: null,
    });
  });
});

describe('weightedWeekMean', () => {
  const start = Date.parse('2024-01-01T00:00:00Z');

  it('averages whole weeks evenly', () => {
    const end = start + 2 * WAR_CHART_WEEK_MS;
    expect(weightedWeekMean([10, 20], start, end)).toBe(15);
  });

  it('does not let a short trailing bucket weigh as much as a full week', () => {
    // Seven days at 60 then one day at 4. The straight average would say 32,
    // which would report a guild as half destroyed on one day's evidence.
    const end = start + WAR_CHART_WEEK_MS + 86400000;
    expect(weightedWeekMean([60, 4], start, end)).toBe(53);
  });

  it('ignores buckets that fall entirely past the window end', () => {
    const end = start + WAR_CHART_WEEK_MS;
    expect(weightedWeekMean([40, 99], start, end)).toBe(40);
  });

  it('returns zero for an empty series', () => {
    expect(weightedWeekMean([], start, start + WAR_CHART_WEEK_MS)).toBe(0);
  });

  it('keeps one decimal, matching the drawn series', () => {
    const end = start + 3 * WAR_CHART_WEEK_MS;
    expect(weightedWeekMean([1, 2, 2], start, end)).toBe(1.7);
  });
});
