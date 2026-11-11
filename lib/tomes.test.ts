import { describe, expect, it } from 'vitest';
import { allocate, MAX_SCREENSHOTS, parseScreenshots, QUEUE_TEXT_LIMIT, queueText, raidRefund, raidTomePrice, raidTomesCost, screenshotKey, warsNeeded, warTomesEarned, type OpenRequest } from './tomes';

describe('very low priority', () => {
  const r = (id: number, priority: OpenRequest['priority'], hoursAgo: number): OpenRequest => ({
    id, uuid: 'u', ign: `M${id}`, kind: 'war', count: 1, given: 0, priority, bucket: 'give_when_available', discord_id: null,
    created_at: new Date(Date.UTC(2026, 0, 1) - hoursAgo * 3600e3).toISOString(), in_guild: true,
  });

  it('is served after low, even when older', () => {
    expect(allocate([r(1, 'very_low', 30), r(2, 'low', 1)], 1).map(a => a.request_id)).toEqual([2]);
  });

  it('is listed after low, with the grey heart', () => {
    const text = queueText([r(1, 'very_low', 30), r(2, 'low', 1)]);
    expect(text.indexOf('🩶 `M1`')).toBeGreaterThan(text.indexOf('💚 `M2`'));
  });
});

describe('queue text (in step with the bot)', () => {
  let id = 0;
  const row = (ign: string, kind: OpenRequest['kind'], left: number, priority: OpenRequest['priority'], bucket: OpenRequest['bucket'], in_guild = true, discord_id: string | null = '1'): OpenRequest => ({
    id: ++id, uuid: 'u', ign, discord_id, kind, count: left + 1, given: 1, priority, bucket, created_at: `2026-01-01 00:00:${String(id % 60).padStart(2, '0')}`, in_guild,
  });

  it('matches Tort-Reborn/tests/test_tomes.py, in serving order', () => {
    const rows = [
      row('Eve', 'war', 20, 'high', 'last_resort'),
      row('Dee', null, 4, 'low', 'give_when_full'),
      row('Cy', 'war', 5, 'high', 'give_when_available', true, null),
      row('Ann_1', 'war', 3, 'very_high', 'give_when_available'),
      row('Bob', 'raid', 2, 'very_high', 'give_when_available'),
      row('Bob', 'war', 1, 'high', 'give_when_available'),
      row('Asleep', 'war', 9, 'high', 'dormant'),
      row('Left', 'war', 9, 'very_high', 'give_when_available', false),
    ];
    expect(queueText(rows)).toBe([
      '__**Give when available**__', '❤️ @Ann_1: 3', '❤️ @Bob: 3', '🧡 `Cy`: 5', '',
      '__**Give when full**__', '💚 @Dee: 4', '',
      '__**Give if no other option**__', '🧡 @Eve: 20',
    ].join('\n'));
  });

  it('says when nothing is waiting, and counts what would not fit', () => {
    expect(queueText([row('Asleep', 'war', 1, 'low', 'dormant')])).toBe('Nothing is waiting.');
    const text = queueText(Array.from({ length: 400 }, (_, i) => row(`Member${String(i).padStart(4, '0')}`, 'war', 2, 'low', 'give_when_available', true, null)));
    const shown = (text.match(/`/g) ?? []).length / 2;
    expect(text.length).toBeLessThanOrEqual(QUEUE_TEXT_LIMIT);
    expect(text.endsWith(`…and ${400 - shown} more members (${(400 - shown) * 2} tomes)`)).toBe(true);
  });
});

describe('screenshot keys', () => {
  const key = screenshotKey('3f2b8c1e-0000-4000-8000-000000000001', 'png');
  it('accepts none, or keys the upload route made', () => {
    expect(parseScreenshots(undefined)).toEqual([]);
    expect(parseScreenshots([key])).toEqual([key]);
  });
  it('refuses any other bucket path, and too many', () => {
    expect(parseScreenshots(['warning_attachments/1/2.png'])).toBeNull();
    expect(parseScreenshots(['tome_screenshots/../secret.png'])).toBeNull();
    expect(parseScreenshots('nope')).toBeNull();
    expect(parseScreenshots(Array(MAX_SCREENSHOTS + 1).fill(key))).toBeNull();
  });
});

// The same table as Tort-Reborn/tests/test_tomes.py: the two must agree.
describe('rules (in step with the bot)', () => {
  it.each([
    [0, 0], [9, 0], [10, 1], [24, 1], [25, 2], [50, 3], [99, 3], [100, 4],
    [149, 4], [150, 5], [3300, 68], [1050, 23], [17800, 358],
  ])('%i lifetime wars earn %i war tomes', (wars, earned) => {
    expect(warTomesEarned(wars)).toBe(earned);
  });

  it('wars needed is the inverse of earned', () => {
    for (let k = 1; k < 400; k++) {
      expect(warTomesEarned(warsNeeded(k))).toBe(k);
      expect(warTomesEarned(warsNeeded(k) - 1)).toBe(k - 1);
    }
  });

  it('prices raid tomes 10 for the first four, then 20', () => {
    expect([1, 2, 3, 4, 5, 6].map(raidTomePrice)).toEqual([10, 10, 10, 10, 20, 20]);
    expect(raidTomesCost(0, 4)).toBe(40);
    expect(raidTomesCost(3, 2)).toBe(30);
  });
});

describe('refunds', () => {
  it('gives back what the ungiven tomes cost', () => {
    // a request for raid tomes 3 to 6: 10 + 10 + 20 + 20 = 60
    expect(raidRefund(4, 0, 60)).toBe(60);
    expect(raidRefund(4, 1, 60)).toBe(50); // the 3rd (10) was given
    expect(raidRefund(4, 2, 60)).toBe(40);
    expect(raidRefund(4, 4, 60)).toBe(0);
  });

  it('refunds nothing for war tomes', () => {
    expect(raidRefund(3, 0, 0)).toBe(0);
  });
});

const req = (id: number, over: Partial<OpenRequest>): OpenRequest => ({
  id, uuid: `u${id}`, ign: `p${id}`, kind: 'war', count: 1, given: 0, priority: 'low',
  bucket: 'give_when_available', created_at: `2026-10-${String(10 + id).padStart(2, '0')}`, in_guild: true, ...over,
});

describe('allocate', () => {
  const open = [
    req(1, { priority: 'low', count: 3 }),
    req(2, { priority: 'very_high', count: 2 }),
    req(3, { priority: 'high', count: 5, given: 4 }),
    req(4, { bucket: 'give_when_full', count: 10 }),
    req(5, { bucket: 'give_when_available', count: 2 }),
    req(6, { priority: 'very_high', count: 9, in_guild: false }),
    req(7, { bucket: 'dormant', count: 9 }),
  ];

  it('serves give when available by priority then age, then give when full', () => {
    expect(allocate(open, 100).map(a => [a.request_id, a.count])).toEqual([[2, 2], [3, 1], [1, 3], [5, 2], [4, 10]]);
  });

  it('stops when the tomes run out, part-filling the last request', () => {
    expect(allocate(open, 4).map(a => [a.request_id, a.count])).toEqual([[2, 2], [3, 1], [1, 1]]);
  });

  it('only reaches give when full once nothing else is waiting', () => {
    expect(allocate(open, 9).some(a => a.request_id === 4)).toBe(true); // 8 available, then this
    expect(allocate(open, 8).some(a => a.request_id === 4)).toBe(false);
  });

  it('reaches give if no other option last of all', () => {
    const withLast = [...open, req(8, { bucket: 'last_resort', count: 4, priority: 'very_high', created_at: '2026-01-01' })];
    expect(allocate(withLast, 100).map(a => a.request_id).at(-1)).toBe(8);
    expect(allocate(withLast, 18).some(a => a.request_id === 8)).toBe(false);
  });

  it('skips members who left and dormant requests', () => {
    const ids = allocate(open, 100).map(a => a.request_id);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
  });

  it('ties go to the oldest', () => {
    const tie = [req(2, { created_at: '2026-10-20' }), req(1, { created_at: '2026-10-01' })];
    expect(allocate(tie, 1)[0].request_id).toBe(1);
  });
});
