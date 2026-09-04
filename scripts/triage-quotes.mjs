#!/usr/bin/env node
/**
 * Triage the fact auditor's quote findings.
 *
 *   node scripts/triage-quotes.mjs [--json out.json]
 *
 * "This quotation is not in the source cited" has three very different causes,
 * and they need opposite fixes:
 *
 *   MISCITED    the words exist, in a different archived document. The claim is
 *               sound; the footnote points at the wrong place.
 *   COMPRESSED  a near-match exists in the cited source — words dropped from the
 *               middle without an ellipsis, so quotation marks promise something
 *               slightly untrue.
 *   ABSENT      nothing resembling it anywhere in the archive. Either it came
 *               from a screenshot, or from nowhere.
 *
 * Only the third needs a human reading the source, and separating the three is
 * what makes the list workable rather than a wall of 168 identical warnings.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'data/wiki/sources/docs');
const RAW = path.join(ROOT, 'data/wiki/sources/raw');
const args = process.argv.slice(2);
const JSON_OUT = args[args.indexOf('--json') + 1];

const norm = (s) =>
  s.replace(/[‘’ʼ′]/g, "'").replace(/[“”″]/g, '"').replace(/[–—−]/g, '-')
    .replace(/…/g, '...').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\[\/?[A-Za-z][^\]]{0,40}\]/g, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    .replace(/\[\s+/g, '[').replace(/\s+\]/g, ']')
    // Nested quotation marks switch kind when quoted, so treat both as one.
    .replace(/['"]/g, '')
    .replace(/[︀-️​-‍﻿]/g, '')
    .replace(/\s+/g, ' ').toLowerCase().trim();

// Load every archived document once; the corpus is small enough to hold.
const corpus = new Map();
for (const dir of [DOCS, RAW]) {
  if (!fs.existsSync(dir)) continue;
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(md|json|txt)$/.test(f)) continue;
    // Strip frontmatter. Our own notes quote the documents they describe, so
    // leaving it in reports a quotation as "found in another source" when it
    // was only ever present in a note we wrote about that source.
    const body = fs
      .readFileSync(path.join(dir, f), 'utf8')
      .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    corpus.set(f.replace(/\.(md|json|txt)$/, ''), norm(body));
  }
}

// Run the auditor and read its findings rather than duplicating its logic.
const tmp = path.join(ROOT, '.triage-findings.json');
execFileSync('node', [path.join(ROOT, 'scripts/check-facts.mjs'), '--only', 'quotes', '--json', tmp], {
  cwd: ROOT, stdio: 'ignore',
});
const { findings } = JSON.parse(fs.readFileSync(tmp, 'utf8'));
fs.unlinkSync(tmp);

const quotes = findings.filter((f) => f.kind === 'quote-not-in-source');

/** Longest run of consecutive words from the quote present in a text. */
function longestRun(words, text) {
  let best = 0;
  for (let n = Math.min(8, words.length); n > best; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      if (text.includes(words.slice(i, i + n).join(' '))) return n;
    }
  }
  return best;
}

const out = [];
for (const f of quotes) {
  const q = norm(f.quote ?? f.detail);
  const words = q.split(' ').filter(Boolean);
  const cited = new Set(f.cited.split(', '));

  let elsewhere = null;
  for (const [id, text] of corpus) {
    if (cited.has(id)) continue;
    if (text.includes(q)) { elsewhere = id; break; }
  }

  let compressed = 0;
  for (const id of cited) {
    const text = corpus.get(id);
    if (text) compressed = Math.max(compressed, longestRun(words, text));
  }

  out.push({
    verdict: elsewhere ? 'MISCITED' : compressed >= 4 ? 'COMPRESSED' : 'ABSENT',
    slug: f.slug,
    quote: f.detail.slice(0, 100),
    cited: f.cited,
    elsewhere,
    matchedWords: compressed,
  });
}

const by = { MISCITED: [], COMPRESSED: [], ABSENT: [] };
for (const o of out) by[o.verdict].push(o);

console.log(`${quotes.length} quote findings triaged\n`);
for (const k of ['MISCITED', 'COMPRESSED', 'ABSENT']) console.log(`  ${k.padEnd(11)} ${by[k].length}`);
console.log();

for (const o of by.MISCITED) {
  console.log(`MISCITED   ${o.slug}`);
  console.log(`   "${o.quote}"`);
  console.log(`   cited ${o.cited} — actually in ${o.elsewhere}`);
}
for (const o of by.COMPRESSED) {
  console.log(`COMPRESSED ${o.slug}  (${o.matchedWords} consecutive words match)`);
  console.log(`   "${o.quote}"  [${o.cited}]`);
}
const bySlug = {};
for (const o of by.ABSENT) (bySlug[o.slug] ??= []).push(o);
console.log(`\nABSENT, by article (${Object.keys(bySlug).length} articles):`);
for (const [slug, list] of Object.entries(bySlug).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${String(list.length).padStart(2)}  ${slug}`);
}

if (JSON_OUT) {
  fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwritten to ${JSON_OUT}`);
}
