import { describe, it, expect } from 'vitest';
import { isKnownWarOutage, outageAt, WAR_OUTAGE_WINDOWS, WAR_OUTAGE_WINDOWS_MS } from './war-outages';

describe('isKnownWarOutage', () => {
  // The day-granularity gaps the DB scan actually detects (2026-09), as
  // (gapStart, gapEnd) date pairs. The spring-2019 outage is detected as two
  // gaps split by a single stray exchange on 2019-05-05.
  const outageGaps: Array<[string, string]> = [
    ['2019-04-06', '2019-05-05'],
    ['2019-05-05', '2019-05-22'],
    ['2019-12-08', '2019-12-13'],
    ['2024-08-11', '2024-08-13'],
    ['2025-05-28', '2025-06-06'],
    ['2025-06-18', '2025-06-21'],
    ['2025-09-12', '2025-09-19'],
  ];

  const recordingGaps: Array<[string, string]> = [
    ['2020-04-06', '2020-04-09'],
    ['2020-05-05', '2020-05-09'],
    ['2020-06-23', '2020-06-25'],
    ['2020-07-19', '2020-07-24'],
    ['2020-11-19', '2020-11-26'],
    ['2020-12-26', '2020-12-28'],
    ['2021-01-27', '2021-02-01'],
    ['2021-02-20', '2021-03-01'],
    ['2021-03-19', '2021-04-01'],
    ['2021-04-18', '2021-04-22'],
    ['2021-04-25', '2021-05-11'],
    ['2021-07-14', '2021-07-28'],
  ];

  it.each(outageGaps)('classifies %s..%s as a war outage', (start, end) => {
    expect(isKnownWarOutage(new Date(start), new Date(end))).toBe(true);
  });

  it.each(recordingGaps)('keeps %s..%s as a recording gap', (start, end) => {
    expect(isKnownWarOutage(new Date(start), new Date(end))).toBe(false);
  });

  it('tolerates one day of boundary drift', () => {
    expect(isKnownWarOutage(new Date('2019-04-05'), new Date('2019-05-23'))).toBe(true);
  });

  it('does not swallow a gap extending well past an outage window', () => {
    expect(isKnownWarOutage(new Date('2019-12-08'), new Date('2019-12-20'))).toBe(false);
  });

  it('has well-formed windows', () => {
    for (const w of WAR_OUTAGE_WINDOWS) {
      expect(Date.parse(w.start)).toBeLessThan(Date.parse(w.end));
    }
  });
});

describe('outageAt', () => {
  it('matches inside a window', () => {
    expect(outageAt(new Date('2019-04-20T12:00:00Z'))?.start).toBe('2019-04-06');
  });

  it('is half-open at the resume point, so the jump target is clean', () => {
    for (const w of WAR_OUTAGE_WINDOWS_MS) {
      expect(outageAt(new Date(w.resumeMs - 1))).not.toBeNull();
      expect(outageAt(new Date(w.resumeMs))).toBeNull();
    }
  });

  it('returns null outside all windows', () => {
    expect(outageAt(new Date('2022-06-15T00:00:00Z'))).toBeNull();
  });
});
