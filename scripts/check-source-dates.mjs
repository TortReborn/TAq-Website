#!/usr/bin/env node
/**
 * Check dated claims in articles against the dated source they cite.
 *
 *   node scripts/check-source-dates.mjs [--source community-guild-timeline] [--slug foo]
 *
 * Written after an expert reader found that the Council of Canyon Kingdoms was
 * described as founded by "seven guilds of the victorious Terra bloc" when two
 * of the seven were never in Terra — and one of them, Kingdom Foxes, was still
 * in the *losing* alliance three days later, as the very source we cited said
 * a few lines further down.
 *
 * Checking that turned up a second and larger problem: every date drawn from
 * that timeline in that article was exactly one day early. This script finds
 * both classes across the corpus.
 *
 * It matches on the entities a claim and a timeline entry have in common
 * (guild and alliance names), then compares the dates. It reports:
 *   OFF-BY-N    a claim whose date differs from the source by N days
 *   UNMATCHED   a dated claim citing this source with no entry that resembles it
 *
 * Both need a human: the matcher is heuristic, and an article legitimately
 * carries dates from other sources in the same sentence as this citation.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const SOURCE = flag('source', 'community-guild-timeline');
const ONLY_SLUG = flag('slug');

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// ---------------------------------------------------------------------------
// the source: a dated bullet list under "<Month> <Year>" headings
// ---------------------------------------------------------------------------

const docPath = path.join(ROOT, 'data/wiki/sources/docs', `${SOURCE}.md`);
if (!fs.existsSync(docPath)) {
  console.error(`no archived doc for "${SOURCE}"`);
  process.exit(1);
}
const lines = fs.readFileSync(docPath, 'utf8').split('\n');

const events = [];
let year = null;
let month = null;
for (const raw of lines) {
  const line = raw.trim();
  const head = line.match(/^([A-Z][a-z]{2})[a-z]*\.?\s+(20\d\d)$/);
  if (head) {
    month = MONTHS[head[1].toLowerCase()] ?? null;
    year = Number(head[2]);
    continue;
  }
  const yr = line.match(/^(?:Undated\s+)?(20\d\d)$/);
  if (yr) { year = Number(yr[1]); month = null; continue; }

  // "* 15th Sep, <text>"  /  "* 3rd Nov, <text>"
  const ev = line.match(/^\*?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]{2})[a-z]*\.?,?\s+(.+)$/);
  if (ev && year) {
    const m = MONTHS[ev[2].toLowerCase()];
    if (m) events.push({ year, month: m, day: Number(ev[1]), text: ev[3].trim() });
  }
}

if (!events.length) {
  console.error(`parsed no dated events out of ${SOURCE} — the document's shape may have changed`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// entities, used to decide whether a claim and an entry are about the same thing
// ---------------------------------------------------------------------------

const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const NAMES = [...new Set(articles.map((a) => a.title).filter((t) => t.length > 3))]
  .sort((a, b) => b.length - a.length);

const entitiesIn = (text) => {
  const found = new Set();
  const low = text.toLowerCase();
  for (const n of NAMES) if (low.includes(n.toLowerCase())) found.add(n);
  return found;
};

const overlap = (a, b) => [...a].filter((x) => b.has(x)).length;
const iso = (e) => `${e.year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`;
const dayNo = (e) => Date.UTC(e.year, e.month - 1, e.day) / 86400000;

// ---------------------------------------------------------------------------
// article claims: a sentence that cites this source AND carries a date
// ---------------------------------------------------------------------------

const CITE = new RegExp(`\\{\\{cite:${SOURCE}[|}]`);
const DATE_RE = /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+(20\d\d)\b/g;

let offBy = 0, matched = 0, unmatched = 0;
const findings = [];

for (const a of articles) {
  if (ONLY_SLUG && a.slug !== ONLY_SLUG) continue;
  const text = `${a.summary}\n${a.body}`;
  if (!CITE.test(text)) continue;

  for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z“"[])/)) {
    if (!CITE.test(sentence)) continue;
    const bare = sentence.replace(/\{\{cite:[^}]*\}\}/g, ' ').replace(/\s+/g, ' ');
    const ents = entitiesIn(bare);

    for (const dm of bare.matchAll(DATE_RE)) {
      const claim = {
        day: Number(dm[1]),
        month: MONTHS[dm[2].slice(0, 3).toLowerCase()],
        year: Number(dm[3]),
      };
      // best candidate: most shared entities, then nearest in time
      let best = null;
      for (const e of events) {
        const score = overlap(ents, entitiesIn(e.text));
        if (!score) continue;
        const delta = Math.abs(dayNo(e) - dayNo(claim));
        if (delta > 21) continue;
        if (!best || score > best.score || (score === best.score && delta < best.delta)) {
          best = { e, score, delta, signed: dayNo(claim) - dayNo(e) };
        }
      }
      if (!best) { unmatched++; findings.push({ kind: 'UNMATCHED', slug: a.slug, claim: dm[0], sentence: bare.slice(0, 150) }); continue; }
      matched++;
      if (best.signed !== 0) {
        offBy++;
        findings.push({
          kind: 'OFF-BY', slug: a.slug, claim: dm[0], signed: best.signed,
          source: `${iso(best.e)} — ${best.e.text.slice(0, 95)}`,
        });
      }
    }
  }
}

console.log(`source "${SOURCE}": ${events.length} dated entries parsed`);
console.log(`dated claims citing it: ${matched + unmatched}  (matched ${matched}, unmatched ${unmatched})`);
console.log(`disagreeing with the source: ${offBy}\n`);

const shifts = {};
for (const f of findings) if (f.kind === 'OFF-BY') shifts[f.signed] = (shifts[f.signed] ?? 0) + 1;
if (Object.keys(shifts).length) {
  console.log('shift distribution (article date minus source date, in days):');
  for (const [d, n] of Object.entries(shifts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(d).padStart(4)} days: ${n}`);
  }
  console.log();
}

for (const f of findings.filter((x) => x.kind === 'OFF-BY')) {
  console.log(`OFF-BY ${String(f.signed).padStart(3)}  ${f.slug}`);
  console.log(`   article: ${f.claim}`);
  console.log(`   source:  ${f.source}`);
}
for (const f of findings.filter((x) => x.kind === 'UNMATCHED')) {
  console.log(`UNMATCHED  ${f.slug}  "${f.claim}"  ${f.sentence}`);
}
