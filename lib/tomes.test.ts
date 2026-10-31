import { describe, expect, it } from 'vitest';
import { allocate, raidRefund, raidTomePrice, raidTomesCost, warsNeeded, warTomesEarned, type OpenRequest } from './tomes';

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
  bucket: 'queue', created_at: `2026-10-${String(10 + id).padStart(2, '0')}`, in_guild: true, ...over,
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

  it('serves the queue by priority, then give when available, then give when full', () => {
    expect(allocate(open, 100).map(a => [a.request_id, a.count])).toEqual([[2, 2], [3, 1], [1, 3], [5, 2], [4, 10]]);
  });

  it('stops when the tomes run out, part-filling the last request', () => {
    expect(allocate(open, 4).map(a => [a.request_id, a.count])).toEqual([[2, 2], [3, 1], [1, 1]]);
  });

  it('only reaches give when full once nothing else is waiting', () => {
    expect(allocate(open, 9).some(a => a.request_id === 4)).toBe(true); // 6 queued + 2 available, then this
    expect(allocate(open, 8).some(a => a.request_id === 4)).toBe(false);
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
