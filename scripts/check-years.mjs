#!/usr/bin/env node
/**
 * Guard against the year typo that keeps happening: 1018 for 2018, 1017 for 2017.
 *
 * It is a single keystroke and it produces a plausible-looking date, so it
 * survives reading. Run over article content and over a commit message before
 * committing:
 *
 *   node scripts/check-years.mjs                 # article fields
 *   node scripts/check-years.mjs --text "$MSG"   # any string
 *
 * Citation locators are stripped first: "L1044" and "p97 #1922" are line and
 * post numbers, not years.
 */
import fs from 'fs';
import path from 'path';

const YEAR = /\b1[0-9]{3}\b/g;
const strip = (s) => s.replace(/\{\{cite:[^}]*\}\}/g, '');

const idx = process.argv.indexOf('--text');
if (idx !== -1) {
  const text = process.argv[idx + 1] ?? '';
  const hits = strip(text).match(YEAR);
  if (hits) {
    console.error('stray year(s): ' + [...new Set(hits)].join(', '));
    process.exit(1);
  }
  console.log('no stray years');
  process.exit(0);
}

const file = path.join(process.cwd(), 'data/wiki/seed-articles.json');
const articles = JSON.parse(fs.readFileSync(file, 'utf8')).articles;
let bad = 0;
for (const a of articles) {
  const text = [a.title, a.summary, a.body, a.leadImageCaption, JSON.stringify(a.infobox ?? [])].join('\n');
  const hits = strip(text).match(YEAR);
  if (hits) { bad++; console.error(`${a.slug}: ${[...new Set(hits)].join(', ')}`); }
}
if (bad) { console.error(`\n${bad} article(s) with a stray 1xxx year.`); process.exit(1); }
console.log(`${articles.length} articles, no stray 1xxx years.`);
