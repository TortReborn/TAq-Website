/**
 * Tome requests (TAQ-116): the rules and handing tomes out.
 *
 * Keep the rules in step with Tort-Reborn/Helpers/tomes.py, which makes the
 * requests: war tomes come from lifetime wars at 10/25/50/100 and then every
 * 50 more; raid tomes cost 10 shells for the first four and 20 after,
 * counting raid tomes only. lib/tomes.test.ts checks the same table as the
 * bot's tests.
 *
 * Handing out works like aspects: whoever gives says how many tomes they
 * have, and `allocate` shares them out, the queue first (priority, then
 * age), then 'give when available', then 'give when full' only once nothing
 * else is waiting. Members no longer in the guild are skipped.
 */

export type TomeKind = 'war' | 'raid';
export type TomeBucket = 'queue' | 'give_when_available' | 'give_when_full' | 'dormant';
export type TomePriority = 'low' | 'medium' | 'high' | 'very_high';

export const PRIORITIES: { key: TomePriority; label: string; color: string }[] = [
  { key: 'very_high', label: 'Very High', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'medium', label: 'Medium', color: '#eab308' },
  { key: 'low', label: 'Low', color: '#22c55e' },
];
export const PRIORITY_RANK: Record<TomePriority, number> = { very_high: 0, high: 1, medium: 2, low: 3 };

/** Order tomes are given out in; dormant requests wait for their member to rejoin. */
export const BUCKETS: { key: TomeBucket; label: string }[] = [
  { key: 'queue', label: 'Queue' },
  { key: 'give_when_available', label: 'Give when available' },
  { key: 'give_when_full', label: 'Give when full' },
  { key: 'dormant', label: 'Dormant (not in the guild)' },
];

const WAR_MILESTONES = [10, 25, 50, 100];
const WAR_STEP = 50;
const RAID_PRICES = [10, 10, 10, 10];
const RAID_PRICE_AFTER = 20;

/** Lifetime wars needed for the k-th war tome (1-based). */
export function warsNeeded(k: number): number {
  return k <= WAR_MILESTONES.length ? WAR_MILESTONES[k - 1] : WAR_MILESTONES[WAR_MILESTONES.length - 1] + WAR_STEP * (k - WAR_MILESTONES.length);
}

export function warTomesEarned(wars: number): number {
  let earned = WAR_MILESTONES.filter(m => wars >= m).length;
  if (earned === WAR_MILESTONES.length) earned += Math.floor((wars - WAR_MILESTONES[WAR_MILESTONES.length - 1]) / WAR_STEP);
  return earned;
}

export function raidTomePrice(k: number): number {
  return k <= RAID_PRICES.length ? RAID_PRICES[k - 1] : RAID_PRICE_AFTER;
}

/** Shells for n more raid tomes when `already` are received or queued. */
export function raidTomesCost(already: number, n: number): number {
  let total = 0;
  for (let k = already + 1; k <= already + n; k++) total += raidTomePrice(k);
  return total;
}

/**
 * Shells to give back when the last `remaining` tomes of a raid request are
 * cancelled. A request's tomes were priced in order, so its first tome was
 * raid tome number start+1 for the `start` that makes its cost add up.
 */
export function raidRefund(count: number, given: number, shellsSpent: number): number {
  const remaining = count - given;
  if (remaining <= 0 || shellsSpent <= 0) return 0;
  for (let start = 0; start <= 10000; start++) {
    if (raidTomesCost(start, count) === shellsSpent) return raidTomesCost(start + given, remaining);
  }
  return Math.round((shellsSpent * remaining) / count); // a price change since: share it out evenly
}

export interface OpenRequest {
  id: number;
  uuid: string;
  ign: string;
  kind: TomeKind | null;
  count: number;
  given: number;
  priority: TomePriority;
  bucket: TomeBucket;
  created_at: string;
  in_guild: boolean;
}

export interface Allocation { request_id: number; ign: string; kind: TomeKind | null; count: number }

export function servingOrder(a: OpenRequest, b: OpenRequest): number {
  const tier = (r: OpenRequest) => BUCKETS.findIndex(x => x.key === r.bucket);
  return tier(a) - tier(b)
    || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    || a.created_at.localeCompare(b.created_at)
    || a.id - b.id;
}

/** Share `tomes` out over the open requests, in serving order. */
export function allocate(requests: OpenRequest[], tomes: number): Allocation[] {
  const out: Allocation[] = [];
  let left = Math.max(0, Math.floor(tomes));
  for (const r of [...requests].filter(r => r.bucket !== 'dormant' && r.in_guild).sort(servingOrder)) {
    if (left <= 0) break;
    const n = Math.min(left, r.count - r.given);
    if (n <= 0) continue;
    out.push({ request_id: r.id, ign: r.ign, kind: r.kind, count: n });
    left -= n;
  }
  return out;
}

export const kindLabel = (kind: TomeKind | null) => (kind === 'war' ? 'War' : kind === 'raid' ? 'Raid' : 'Any');
