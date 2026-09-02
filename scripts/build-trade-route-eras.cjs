// Build normalized era route-graph files for public/trade-routes/ from dated
// community snapshots, validating names against the site's
// territories_verbose.json (which includes retired territories).
//
// Source snapshots (scripts/trade-route-sources/) and their provenance:
// - routes-2021-02-17-avicia.json  — albarv340/avicia routefinder @ fb004f63,
//   the 1.20-launch graph
// - routes-2021-11-13-avicia.json  — avicia @ 8361e409 ("correct (hopefully)
//   connections" resurvey); byte-identical to fa-rog/economy 2023-12 and
//   Catniped/WynnMAPI 2024-05 snapshots, so it covers late-1.20 + all of 2.0
// - routes-2025-11-03-dernal.json  — BadPingHere/dernal @ 39f94195, the
//   cleanest 2.1-era graph (cross-checked against titantimes/valor and
//   fa-rog/economy)
// The per-era add/remove edits below encode changes whose dates fall inside
// a snapshot span, with evidence windows documented in lib/trade-routes.ts.
//
// Run from the repo root: node scripts/build-trade-route-eras.cjs
const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..');
const MINED = path.join(__dirname, 'trade-route-sources');
const OUT = path.join(SITE, 'public', 'trade-routes');

const verbose = JSON.parse(fs.readFileSync(path.join(SITE, 'public', 'territories_verbose.json'), 'utf8'));
const knownNames = new Set(Object.keys(verbose));

// Normalize curly apostrophes to straight for matching, keep canonical site name
const canon = new Map(); // normalized -> site name
for (const k of knownNames) canon.set(k.replace(/\u2019/g, "'").toLowerCase(), k);
// Known source-data typos \u2192 canonical site names
const ALIASES = { 'Otherwordly Monolith': 'Otherworldly Monolith' };
const toSiteName = (n) => {
  if (ALIASES[n]) n = ALIASES[n];
  if (knownNames.has(n)) return n;
  return canon.get(n.replace(/\u2019/g, "'").toLowerCase()) ?? null;
};

// Load an adjacency source into { name: Set(partners) } (raw names)
function loadAdjacency(file) {
  const raw = fs.readFileSync(path.join(MINED, file), 'utf8');
  const obj = JSON.parse(raw);
  const adj = {};
  if (Array.isArray(obj)) throw new Error('unexpected array in ' + file);
  for (const [k, v] of Object.entries(obj)) {
    const partners = Array.isArray(v) ? v : v['Trading Routes'];
    if (!partners) continue;
    adj[k] = partners;
  }
  return adj;
}

function buildEra(sourceFile, outName, edits = {}) {
  const adj = loadAdjacency(sourceFile);
  const unmatched = new Set();
  // symmetrize on site-canonical names
  const pairs = new Set();
  const graph = {};
  const add = (a, b) => {
    (graph[a] ??= new Set()).add(b);
    (graph[b] ??= new Set()).add(a);
    pairs.add(a < b ? a + '|' + b : b + '|' + a);
  };
  for (const [rawA, partners] of Object.entries(adj)) {
    const a = toSiteName(rawA);
    if (!a) { unmatched.add(rawA); continue; }
    for (const rawB of partners) {
      const b = toSiteName(rawB);
      if (!b) { unmatched.add(rawB); continue; }
      add(a, b);
    }
  }
  // Apply per-era corrections: remove bad pairs, add known-good ones
  for (const [a, b] of edits.remove ?? []) {
    graph[a]?.delete(b); graph[b]?.delete(a);
    pairs.delete(a < b ? a + '|' + b : b + '|' + a);
  }
  for (const [a, b] of edits.add ?? []) add(a, b);

  const out = {};
  for (const [name, set] of Object.entries(graph).sort((x, y) => x[0].localeCompare(y[0]))) {
    out[name] = { 'Trading Routes': [...set].sort() };
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, outName), JSON.stringify(out, null, 1));
  console.log(`${outName}: ${Object.keys(out).length} territories, ${pairs.size} pairs, unmatched: ${unmatched.size}`);
  if (unmatched.size) console.log('  UNMATCHED:', [...unmatched].join(' | '));
}

// Era 1: 1.20 launch graph (Jan 20, 2021 – 1.20.3). The Feb 2021 snapshot
// carried Aldorei's Arch <-> Canyon Upper North West, which avicia itself
// later removed as "one incorrect trade route"; the corrected partner
// (Canyon Waterfall North, seen from Nov 2021) was the real route all along.
buildEra('routes-2021-02-17-avicia.json', '2021-01.json', {
  remove: [["Aldorei's Arch", 'Canyon Upper North West']],
  add: [["Aldorei's Arch", 'Canyon Waterfall North']],
});
// Era 2: 1.20.3 (Jul 5, 2021) until the Bloody Beach <-> Corkus Countryside
// removal (window Jul 16 – Nov 13, 2021; leaning real change — removed in a
// resurvey that stuck for 3+ years). Built from the Nov snapshot plus that
// edge, which equals the corrected Jul 16 graph.
buildEra('routes-2021-11-13-avicia.json', '2021-07.json', {
  add: [['Bloody Beach', 'Corkus Countryside']],
});
// Era 3: Nov 2021 through all of 2.0 (byte-identical snapshots 2021-11,
// 2023-12, 2024-05)
buildEra('routes-2021-11-13-avicia.json', '2021-11.json');
// Era 4: 2.1 Rekindled launch (Aug 2024) until the Corkus City Crossroads
// <-> Picnic Pond removal (window Jun 2 – Jul 31, 2025; confirmed by three
// independent sources). Dernal snapshot plus that edge.
buildEra('routes-2025-11-03-dernal.json', '2024-08.json', {
  add: [['Corkus City Crossroads', 'Picnic Pond']],
});
// Era 5: post-removal 2.1 (Jul 31, 2025 – Apr 2026)
buildEra('routes-2025-11-03-dernal.json', '2025-07.json');
// Era 6 (2.2 Fruma, Apr 2026+) uses the site's live territories_verbose.json
