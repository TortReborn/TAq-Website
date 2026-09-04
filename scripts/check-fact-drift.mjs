#!/usr/bin/env node
/**
 * Compare the article corpus against a git revision and report factual drift:
 * dates, figures, citations and wiki links that appeared or vanished.
 *
 *   node scripts/check-fact-drift.mjs                # vs HEAD
 *   node scripts/check-fact-drift.mjs --rev <sha>    # vs any revision
 *   node scripts/check-fact-drift.mjs --strict       # non-zero exit if anything drifted
 *
 * Run this after any bulk rewrite. A style pass is supposed to change wording
 * only, so everything this prints is either a deliberate correction or a
 * mistake — and each one needs a decision. It will not tell them apart.
 *
 * It also checks the protected class the house style singles out: sentences
 * that record two sources disagreeing. Those earn their in-text attribution
 * and must survive a pass that is otherwise stripping attribution.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const revIdx = args.indexOf('--rev');
const REV = revIdx === -1 ? 'HEAD' : args[revIdx + 1];

const load = (src) => JSON.parse(src).articles;
const before = load(execSync(`git show ${REV}:data/wiki/seed-articles.json`, { cwd: ROOT, maxBuffer: 1 << 28 }).toString());
const after = load(readFileSync(join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));

const whole = (a) => `${a.summary}\n${(a.infobox ?? []).map((r) => `${r.label}: ${r.value}`).join('\n')}\n${a.body}`;
const norm = (s) => s.replace(/\s+/g, ' ').trim();

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const monthNum = (name) =>
  ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(name.toLowerCase().slice(0, 3)) + 1;

function dates(t) {
  const out = new Set();
  const push = (d, m, y) => out.add(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  for (const m of t.matchAll(new RegExp(`(\\d{1,2})\\s+(${MONTHS})\\.?,?\\s+(\\d{4})`, 'gi'))) push(+m[1], monthNum(m[2]), m[3]);
  for (const m of t.matchAll(new RegExp(`(${MONTHS})\\.?\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'gi'))) push(+m[2], monthNum(m[1]), m[3]);
  for (const m of t.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) push(+m[3], +m[2], m[1]);
  for (const m of t.matchAll(new RegExp(`(${MONTHS})\\.?\\s+(\\d{4})`, 'gi'))) out.add(`${m[2]}-${String(monthNum(m[1])).padStart(2, '0')}`);
  return out;
}

// Strip citations and image paths first: locators and filename hashes are full
// of digits that are not claims about the past.
const figures = (t) =>
  new Set(
    [...t.replace(/\{\{cite:[^}]*\}\}/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').matchAll(/\b\d{1,3}(?:,\d{3})+\b|\b\d{1,4}\b/g)]
      .map((m) => m[0].replace(/,/g, '')),
  );
const citations = (t) => new Set([...t.matchAll(/\{\{cite:([^}|]+)/g)].map((m) => norm(m[1])));
const links = (t) => new Set([...t.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)].map((m) => norm(m[1]).toLowerCase()));

// Sentences recording that sources disagree — attribution here is required.
const DISAGREEMENT = /\b(?:not been reconciled|unreconciled|contradicts?|disagree(?:s|ment)?|while another|inconsistent|cannot support|does not fit|discrepanc(?:y|ies)|unresolved|conflicts? with|a different (?:date|event|alliance|release))\b/i;

const beforeBySlug = new Map(before.map((a) => [a.slug, a]));
const findings = [];

for (const w of after) {
  const h = beforeBySlug.get(w.slug);
  if (!h) { findings.push({ slug: w.slug, kind: 'new-article', gone: [], added: [] }); continue; }
  const bt = whole(h), at = whole(w);

  for (const [kind, fn] of [['date', dates], ['figure', figures], ['citation', citations], ['link', links]]) {
    const a = fn(bt), b = fn(at);
    const gone = [...a].filter((x) => !b.has(x));
    const added = [...b].filter((x) => !a.has(x));
    if (gone.length || added.length) findings.push({ slug: w.slug, kind, gone, added });
  }

  // Protected class: a recorded disagreement must still be recorded. Compare on
  // content words, so rewording does not read as deletion.
  const words = (s) => new Set(norm(s).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter((x) => x.length > 4));
  const afterWords = words(at);
  for (const sentence of norm(bt).split(/(?<=[.!?])\s+/)) {
    if (!DISAGREEMENT.test(sentence) || sentence.length < 45) continue;
    const key = [...words(sentence)];
    const kept = key.filter((x) => afterWords.has(x)).length / Math.max(1, key.length);
    if (kept < 0.6) findings.push({ slug: w.slug, kind: 'DISAGREEMENT DROPPED', gone: [sentence.slice(0, 180)], added: [] });
  }
}
for (const h of before) if (!after.find((a) => a.slug === h.slug)) findings.push({ slug: h.slug, kind: 'deleted-article', gone: [], added: [] });

const rank = ['deleted-article', 'new-article', 'DISAGREEMENT DROPPED', 'citation', 'date', 'figure', 'link'];
findings.sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind) || a.slug.localeCompare(b.slug));

const counts = {};
for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;

console.log(`corpus vs ${REV}: ${before.length} -> ${after.length} articles\n`);
for (const f of findings) {
  console.log(`${f.kind.padEnd(21)} ${f.slug}`);
  if (f.gone.length) console.log(`   gone:  ${f.gone.slice(0, 10).join('  ')}${f.gone.length > 10 ? ` …(+${f.gone.length - 10})` : ''}`);
  if (f.added.length) console.log(`   added: ${f.added.slice(0, 10).join('  ')}${f.added.length > 10 ? ` …(+${f.added.length - 10})` : ''}`);
}
console.log(`\n${'='.repeat(64)}`);
console.log(Object.keys(counts).length ? counts : 'no drift');
console.log('\nEvery line above is a deliberate correction or a mistake. Check each.');

const serious = findings.filter((f) => f.kind === 'DISAGREEMENT DROPPED' || f.kind === 'deleted-article').length;
if (serious) console.log(`\n${serious} finding(s) in the protected class — recorded disagreements and whole articles.`);
if (strict && findings.length) process.exit(1);
