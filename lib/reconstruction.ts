/**
 * Territory ownership before the exchange log begins.
 *
 * `territory_exchanges` starts on 3 January 2018. For the three years before
 * that no event stream exists. Three copies of the game's own territory list
 * survive (23 and 24 December 2014, 13 June 2016), and those anchors are exact.
 * The rest are built from labelled map screenshots, one archived
 * guild-leaderboard capture, in-game screenshots and dated forum statements, so
 * this module serves a *reconstruction*: dated anchor states with the ground
 * between them filled in.
 *
 * It is not a record and must never be presented as one. Every tile carries a
 * provenance code and the map shows a standing banner while the scrubber sits
 * in this period. See data/chronicle/pre2018-reconstruction.json for the
 * anchors and the note attached to each.
 *
 * How the fill works: territory does not change hands at random. A guild takes
 * ground next to ground it already holds. So between two anchors, each tile
 * that has to change is ordered by how far it sits from the nearest tile its
 * incoming holder already had, and the changes play in that order — fronts
 * advancing rather than tiles blinking. Only the anchors are evidenced; the
 * route between them is inference.
 */
import type { SnapshotTerritory } from './history-data';
import raw from '@/data/chronicle/pre2018-reconstruction.json';

interface Anchor {
  date: string;
  label: string;
  note: string;
  /** owner guild index per territory, -1 = not in play at this date */
  o: number[];
  /** 2 attested · 1 inferred · 0 guessed · -1 not in play */
  p: number[];
}
interface ReconstructionData {
  start: string;
  handover: string;
  territories: string[];
  guilds: Array<{ name: string; prefix: string }>;
  anchors: Anchor[];
}

const DATA = raw as unknown as ReconstructionData;

/** First moment the reconstruction covers — the Guild Update. */
export const RECONSTRUCTION_START = new Date(`${DATA.start}T00:00:00Z`);
/** First moment the exchange log covers. Everything before this is synthetic. */
export const RECONSTRUCTION_END = new Date(`${DATA.handover}T00:00:00Z`);

export const PROVENANCE_LABELS = ['guessed', 'inferred', 'attested'] as const;

// An anchor taken from a timed capture carries its full UTC instant; the rest are whole days.
const ANCHOR_MS = DATA.anchors.map((a) => Date.parse(a.date.includes('T') ? a.date : `${a.date}T00:00:00Z`));
const N = DATA.territories.length;

/** True while the scrubber is in reconstructed time. */
export function isReconstructed(date: Date): boolean {
  const ms = date.getTime();
  return ms >= RECONSTRUCTION_START.getTime() && ms < RECONSTRUCTION_END.getTime();
}

/** Centre of each territory, used to order changes by distance. */
let centres: Array<[number, number]> | null = null;
function ensureCentres(
  verbose: Record<string, { Location: { start: [number, number]; end: [number, number] } }> | null,
): boolean {
  if (centres) return true;
  if (!verbose) return false;
  const out: Array<[number, number]> = [];
  for (const name of DATA.territories) {
    const loc = verbose[name]?.Location;
    if (!loc) { out.push([0, 0]); continue; }
    out.push([(loc.start[0] + loc.end[0]) / 2, (loc.start[1] + loc.end[1]) / 2]);
  }
  centres = out;
  return true;
}

/** Stable per-territory jitter so a front does not advance as a ruled line. */
const JITTER = DATA.territories.map((name) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000) / 1000;
});

/**
 * Order in which the tiles that differ between two states change hands,
 * expressed as a fraction of the interval. Cached per anchor pair.
 */
const frontCache = new Map<string, Float32Array>();
function frontOrder(key: string, from: number[], to: number[]): Float32Array {
  const hit = frontCache.get(key);
  if (hit) return hit;

  const order = new Float32Array(N).fill(-1);
  const holders = new Map<number, number[]>();
  for (let i = 0; i < N; i++) {
    const g = from[i];
    if (g < 0) continue;
    let list = holders.get(g);
    if (!list) { list = []; holders.set(g, list); }
    list.push(i);
  }

  // A guild that held nothing before the interval still has to start
  // somewhere. Grow it out from the heart of the ground it ends up with (the
  // tile closest on average to the rest of its holding) rather than having its
  // whole holding appear at once.
  if (centres) {
    const incoming = new Map<number, number[]>();
    for (let i = 0; i < N; i++) {
      const g = to[i];
      if (g < 0 || holders.has(g)) continue;
      let list = incoming.get(g);
      if (!list) { list = []; incoming.set(g, list); }
      list.push(i);
    }
    for (const [g, tiles] of incoming) {
      let core = tiles[0];
      let bestSum = Infinity;
      for (const i of tiles) {
        let sum = 0;
        for (const j of tiles) sum += Math.hypot(centres[i][0] - centres[j][0], centres[i][1] - centres[j][1]);
        if (sum < bestSum) { bestSum = sum; core = i; }
      }
      holders.set(g, [core]);
    }
  }

  const changing: Array<[number, number]> = [];
  for (let i = 0; i < N; i++) {
    if (to[i] < 0 || from[i] === to[i]) continue;
    const src = holders.get(to[i]);
    let best = Infinity;
    if (src && centres) {
      const [cx, cy] = centres[i];
      for (const j of src) {
        const dx = cx - centres[j][0];
        const dy = cy - centres[j][1];
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
    }
    changing.push([i, best === Infinity ? Number.MAX_SAFE_INTEGER : Math.sqrt(best)]);
  }
  changing.sort((a, b) => a[1] - b[1]);

  const n = changing.length;
  for (let k = 0; k < n; k++) {
    const i = changing[k][0];
    const base = 0.03 + 0.94 * (n > 1 ? k / (n - 1) : 0);
    order[i] = Math.min(0.995, Math.max(0.005, base + (JITTER[i] - 0.5) * 0.07));
  }
  frontCache.set(key, order);
  return order;
}

export interface ReconstructedState {
  territories: Record<string, SnapshotTerritory>;
  /** The anchor this moment is drawn from. */
  anchor: { date: string; label: string; note: string };
  /** Tile counts by provenance: [guessed, inferred, attested]. */
  provenance: [number, number, number];
}

/**
 * Ownership at `date`, or null outside the reconstructed period. `verbose` is
 * the territory geometry, needed to order changes spatially; without it the
 * anchors still resolve but the fill between them is unordered.
 */
export function reconstructAt(
  date: Date,
  verbose: Record<string, { Location: { start: [number, number]; end: [number, number] } }> | null,
): ReconstructedState | null {
  if (!isReconstructed(date)) return null;
  ensureCentres(verbose);

  const ms = date.getTime();
  let k = 0;
  while (k + 1 < ANCHOR_MS.length && ANCHOR_MS[k + 1] <= ms) k++;
  const A = DATA.anchors[k];
  const B = DATA.anchors[k + 1];

  let owner: number[];
  let prov: number[];
  if (!B || ms <= ANCHOR_MS[k]) {
    owner = A.o;
    prov = A.p;
  } else {
    const f = (ms - ANCHOR_MS[k]) / (ANCHOR_MS[k + 1] - ANCHOR_MS[k]);
    const order = frontOrder(`A${k}`, A.o, B.o);
    owner = new Array(N);
    prov = new Array(N);
    for (let i = 0; i < N; i++) {
      if (A.o[i] === B.o[i]) { owner[i] = A.o[i]; prov[i] = Math.min(A.p[i], B.p[i]); continue; }
      owner[i] = order[i] >= 0 && f >= order[i] ? B.o[i] : A.o[i];
      prov[i] = 0;
    }
  }

  const territories: Record<string, SnapshotTerritory> = {};
  const counts: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    const g = owner[i];
    if (g < 0) continue;
    const guild = DATA.guilds[g];
    if (!guild) continue;
    territories[DATA.territories[i]] = { g: guild.prefix, n: guild.name };
    const pv = prov[i];
    if (pv >= 0 && pv <= 2) counts[pv]++;
  }

  return { territories, anchor: { date: A.date, label: A.label, note: A.note }, provenance: counts };
}

/** The anchor covering `date`, for labelling. Null outside the period. */
export function anchorAt(date: Date): { date: string; label: string; note: string } | null {
  if (!isReconstructed(date)) return null;
  const ms = date.getTime();
  let k = 0;
  while (k + 1 < ANCHOR_MS.length && ANCHOR_MS[k + 1] <= ms) k++;
  const a = DATA.anchors[k];
  return { date: a.date, label: a.label, note: a.note };
}
