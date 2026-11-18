// Re-place the guessed tiles of the pre-2018 reconstruction so each guild sits
// in compact blocs instead of bands.
//
// Most tiles in data/chronicle/pre2018-reconstruction.json carry provenance 0
// (guessed): the anchor fixes how many tiles a guild held, not which. This
// script only decides *which*. It keeps, per anchor:
//   - every attested (2) and inferred (1) tile exactly as it is,
//   - the set of tiles in play,
//   - each guild's guessed-tile count inside each landmass (so nobody crosses
//     from Wynn to Gavel or onto an island they did not hold),
// and swaps guessed tiles between guilds (simulated annealing) to shorten the
// borders between owners. A tile also gets a bonus for keeping the owner it
// had at the previous anchor, so blocs stay put across the timeline.
//
// Deterministic. Run from the repo root after editing anchors:
//   node scripts/clump-pre2018-reconstruction.cjs
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const FILE = path.join(SITE, 'data', 'chronicle', 'pre2018-reconstruction.json');
const verbose = JSON.parse(fs.readFileSync(path.join(SITE, 'public', 'territories_verbose.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

const ZONE_GAP = 100;   // blocks: tiles closer than this share a landmass
const NEIGHBOUR_GAP = 80; // blocks: tiles closer than this share a border
const STAY = 0.6;       // bonus for keeping the previous anchor's owner

const N = data.territories.length;
const rects = data.territories.map((name) => {
  const l = verbose[name]?.Location;
  if (!l) throw new Error(`no geometry for ${name}`);
  return {
    x0: Math.min(l.start[0], l.end[0]), x1: Math.max(l.start[0], l.end[0]),
    z0: Math.min(l.start[1], l.end[1]), z1: Math.max(l.start[1], l.end[1]),
  };
});
const gap = Array.from({ length: N }, () => new Float64Array(N));
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const a = rects[i], b = rects[j];
    const dx = Math.max(0, a.x0 - b.x1, b.x0 - a.x1);
    const dz = Math.max(0, a.z0 - b.z1, b.z0 - a.z1);
    gap[i][j] = gap[j][i] = Math.hypot(dx, dz);
  }
}

// Landmasses: connected components under ZONE_GAP.
const zone = new Int32Array(N).fill(-1);
for (let s = 0, k = 0; s < N; s++) {
  if (zone[s] >= 0) continue;
  zone[s] = k;
  const stack = [s];
  while (stack.length) {
    const i = stack.pop();
    for (let j = 0; j < N; j++) if (zone[j] < 0 && gap[i][j] <= ZONE_GAP) { zone[j] = k; stack.push(j); }
  }
  k++;
}

// Weighted border graph; isolated tiles are tied weakly to their two nearest.
const nb = Array.from({ length: N }, () => new Map());
const link = (i, j, w) => { nb[i].set(j, Math.max(nb[i].get(j) ?? 0, w)); nb[j].set(i, Math.max(nb[j].get(i) ?? 0, w)); };
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) if (gap[i][j] <= NEIGHBOUR_GAP) link(i, j, 1 / (1 + gap[i][j] / 20));
}
for (let i = 0; i < N; i++) {
  if (nb[i].size >= 2) continue;
  const near = [...Array(N).keys()].filter((j) => j !== i).sort((a, b) => gap[i][a] - gap[i][b]).slice(0, 2);
  for (const j of near) link(i, j, 0.3);
}
const NB = nb.map((m) => [...m.entries()]);

let seed = 12345;
const rand = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296);

const quotaKey = (owner, keep) => {
  const m = {};
  keep.forEach((i) => { const k = `${owner[i]}@${zone[i]}`; m[k] = (m[k] || 0) + 1; });
  return JSON.stringify(Object.entries(m).sort());
};
const borderLength = (owner) => {
  let s = 0;
  for (let i = 0; i < N; i++) {
    if (owner[i] < 0) continue;
    for (const [j, w] of NB[i]) if (j > i && owner[j] >= 0 && owner[j] !== owner[i]) s += w;
  }
  return s;
};

let prev = null;
for (const anchor of data.anchors) {
  const o = anchor.o.slice();
  const free = [];
  for (let i = 0; i < N; i++) if (o[i] >= 0 && anchor.p[i] === 0) free.push(i);
  const byZone = new Map();
  for (const i of free) {
    if (!byZone.has(zone[i])) byZone.set(zone[i], []);
    byZone.get(zone[i]).push(i);
  }

  // Start from the previous anchor wherever its owner still has quota here.
  if (prev) {
    for (const tiles of byZone.values()) {
      const quota = new Map();
      for (const i of tiles) quota.set(o[i], (quota.get(o[i]) || 0) + 1);
      const rest = [];
      for (const i of tiles) {
        const q = prev[i];
        if (q >= 0 && (quota.get(q) || 0) > 0) { o[i] = q; quota.set(q, quota.get(q) - 1); } else rest.push(i);
      }
      const pool = [];
      for (const [q, n] of quota) for (let k = 0; k < n; k++) pool.push(q);
      rest.forEach((i, k) => { o[i] = pool[k]; });
    }
  }

  const cost = (i, g) => {
    let c = 0;
    for (const [j, w] of NB[i]) {
      if (o[j] < 0) c += w * 0.15;      // mild pull towards the edge of play
      else if (o[j] !== g) c += w;
    }
    if (prev && prev[i] === g) c -= STAY;
    return c;
  };

  for (const tiles of byZone.values()) {
    if (tiles.length < 2) continue;
    const iters = tiles.length * 4000;
    for (let it = 0; it < iters; it++) {
      const T = 1.5 * Math.pow(0.002 / 1.5, it / iters);
      const i = tiles[(rand() * tiles.length) | 0];
      const j = tiles[(rand() * tiles.length) | 0];
      const gi = o[i], gj = o[j];
      if (gi === gj) continue;
      const before = cost(i, gi) + cost(j, gj);
      o[i] = gj; o[j] = gi;
      const d = cost(i, gj) + cost(j, gi) - before;
      if (d > 0 && rand() >= Math.exp(-d / T)) { o[i] = gi; o[j] = gj; }
    }
  }

  if (quotaKey(o, free) !== quotaKey(anchor.o, free)) throw new Error(`guessed counts changed at ${anchor.date}`);
  for (let i = 0; i < N; i++) {
    if ((anchor.p[i] !== 0 || anchor.o[i] < 0) && o[i] !== anchor.o[i]) throw new Error(`evidenced tile moved at ${anchor.date}`);
  }
  console.log(`${anchor.date}  border ${borderLength(anchor.o).toFixed(1)} -> ${borderLength(o).toFixed(1)}`);
  anchor.o = o;
  prev = o;
}

fs.writeFileSync(FILE, JSON.stringify(data));
