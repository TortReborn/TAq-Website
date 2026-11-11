/**
 * Tome requests (TAQ-116): the rules and handing tomes out.
 *
 * Keep the rules in step with Tort-Reborn/Helpers/tomes.py, which makes the
 * requests: war tomes come from wars done in TAq at 10/25/50/100 and then every
 * 50 more; shell tomes (stored as kind 'raid') cost 10 shells for the first
 * four and 20 after, counting shell tomes only. lib/tomes.test.ts checks the same table as the
 * bot's tests.
 *
 * The queue is handed out in-game by the mod's Distribute, through verge-api
 * (TAQ-118). `allocate` is the serving order it follows: give when available,
 * then give when full, then give if no other option, by priority then age
 * within each; the mod serves the last two only when its toggle is on.
 * Members no longer in the guild are skipped.
 */

export type TomeKind = 'war' | 'raid';
export type TomeBucket = 'give_when_available' | 'give_when_full' | 'last_resort' | 'dormant';
export type TomePriority = 'very_low' | 'low' | 'medium' | 'high' | 'very_high';

export const PRIORITIES: { key: TomePriority; label: string; color: string }[] = [
  { key: 'very_high', label: 'Very High', color: '#ef4444' },
  { key: 'high', label: 'High', color: '#f97316' },
  { key: 'medium', label: 'Medium', color: '#eab308' },
  { key: 'low', label: 'Low', color: '#22c55e' },
  { key: 'very_low', label: 'Very Low', color: '#94a3b8' },
];
export const PRIORITY_RANK: Record<TomePriority, number> = { very_high: 0, high: 1, medium: 2, low: 3, very_low: 4 };

/** Order tomes are given out in; dormant requests wait for their member to rejoin. */
export const BUCKETS: { key: TomeBucket; label: string }[] = [
  { key: 'give_when_available', label: 'Give when available' },
  { key: 'give_when_full', label: 'Give when full' },
  { key: 'last_resort', label: 'Give if no other option' },
  { key: 'dormant', label: 'Dormant (not in the guild)' },
];

const WAR_MILESTONES = [10, 25, 50, 100];
const WAR_STEP = 50;
const RAID_PRICES = [10, 10, 10, 10];
const RAID_PRICE_AFTER = 20;

/** TAq wars needed for the k-th war tome (1-based). */
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
  discord_id?: string | null;
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

export const kindLabel = (kind: TomeKind | null) => (kind === 'war' ? 'War' : kind === 'raid' ? 'Shell' : 'Any');

/** Screenshots of a give, at most this many, stored under keys from screenshotKey. */
export const MAX_SCREENSHOTS = 10;
const SCREENSHOT_KEY = /^tome_screenshots\/[0-9a-f-]{36}\.(png|jpg|gif|webp)$/;
export const screenshotKey = (id: string, ext: string) => `tome_screenshots/${id}.${ext}`;
export const isScreenshotKey = (key: unknown): key is string => typeof key === 'string' && SCREENSHOT_KEY.test(key);
/** The keys a give was sent with, or null if there are too many or any is not ours. */
export const parseScreenshots = (keys: unknown): string[] | null => {
  if (keys === undefined || keys === null) return [];
  return Array.isArray(keys) && keys.length <= MAX_SCREENSHOTS && keys.every(isScreenshotKey) ? keys : null;
};

const PRIORITY_EMOJI: Record<TomePriority, string> = { very_high: '❤️', high: '🧡', medium: '💛', low: '💚', very_low: '🩶' };
export const QUEUE_TEXT_LIMIT = 3900;

/**
 * The queue as a panel's {{tome_queue}} shows it: one line a member per section,
 * in serving order, leaving out who a give skips. The bot draws the real one,
 * with a mention for each linked member; this is the editor's preview, which
 * writes those as @IGN because it can't look members up. Keep in step with
 * queue_text in Tort-Reborn/Helpers/tomes.py (the tests of both check the same table).
 */
export function queueText(requests: OpenRequest[]): string {
  const rows = requests.filter(r => r.bucket !== 'dormant' && r.in_guild && r.count > r.given).sort(servingOrder);
  if (!rows.length) return 'Nothing is waiting.';
  // A heading per bucket in serving order; under it one line a member, with the
  // heart of their highest priority there (rows are in serving order, so the first seen).
  const sections = new Map<TomeBucket, Map<string, { n: number; priority: TomePriority }>>();
  for (const r of rows) {
    if (!sections.has(r.bucket)) sections.set(r.bucket, new Map());
    const members = sections.get(r.bucket)!;
    const who = r.discord_id ? `@${r.ign}` : `\`${r.ign}\``;
    const m = members.get(who);
    if (m) m.n += r.count - r.given;
    else members.set(who, { n: r.count - r.given, priority: r.priority });
  }

  const lines: { text: string; ign?: string; tomes: number }[] = [];
  for (const [bucket, members] of sections) {
    lines.push({ text: `\n__**${BUCKETS.find(b => b.key === bucket)!.label}**__`, tomes: 0 });
    for (const [who, m] of members) lines.push({ text: `${PRIORITY_EMOJI[m.priority]} ${who}: ${m.n}`, ign: who, tomes: m.n });
  }
  let text = '';
  for (let i = 0; i < lines.length; i++) {
    if (text.length + lines[i].text.length + 1 > QUEUE_TEXT_LIMIT - 60) {
      const rest = lines.slice(i).filter(l => l.ign);
      const who = new Set(rest.map(l => l.ign)).size;
      return `${text.trimStart()}\n…and ${who} more member${who === 1 ? '' : 's'} (${rest.reduce((n, l) => n + l.tomes, 0)} tomes)`;
    }
    text += `\n${lines[i].text}`;
  }
  return text.trimStart();
}
