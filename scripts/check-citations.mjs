#!/usr/bin/env node
/**
 * Check that every citation in the wiki resolves to something a reader can open.
 *
 *   node scripts/check-citations.mjs            report
 *   node scripts/check-citations.mjs --strict   exit non-zero if anything is unresolved
 *
 * A citation resolves when its ref is an archived source id (which gets a page
 * at /chronicle/references/<id>) or an absolute http(s) URL. Anything else
 * renders as plain text in the reference list and leads nowhere, which is the
 * thing this guards against.
 *
 * It also verifies that every lead image and every body image points at a file
 * that actually exists under public/, so a rename cannot quietly break them.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');

const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/sources/index.json'), 'utf8')).sources;
const ids = new Set(Object.keys(sources));

const CITE = /\{\{cite:([^}|]+)(?:\|([^}]*))?\}\}/g;
const IMG = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

let citations = 0;
const unresolved = new Map();
const missingFiles = new Map();
const uncaptioned = [];

const checkImage = (slug, src, caption, where) => {
  if (caption !== null && !caption.trim()) uncaptioned.push(`${slug} (${where}): ${src}`);
  if (!src.startsWith('/')) return; // external images are the author's problem, not a broken path
  if (!fs.existsSync(path.join(ROOT, 'public', src))) {
    if (!missingFiles.has(src)) missingFiles.set(src, []);
    missingFiles.get(src).push(slug);
  }
};

for (const a of articles) {
  for (const m of a.body.matchAll(CITE)) {
    citations++;
    const ref = m[1].trim();
    if (ids.has(ref) || /^https?:\/\//.test(ref)) continue;
    if (!unresolved.has(ref)) unresolved.set(ref, []);
    unresolved.get(ref).push(a.slug);
  }
  for (const m of a.body.matchAll(IMG)) checkImage(a.slug, m[2], m[1], 'body');
  if (a.leadImage) checkImage(a.slug, a.leadImage, a.leadImageCaption ?? '', 'lead');
}

const pct = citations ? ((citations - [...unresolved.values()].reduce((n, v) => n + v.length, 0)) / citations * 100) : 100;
console.log(`${articles.length} articles, ${citations} citations, ${ids.size} archived sources`);
console.log(`resolving to a link: ${pct.toFixed(1)}%`);

if (unresolved.size) {
  console.log(`\n${unresolved.size} citation targets do not resolve:`);
  for (const [ref, slugs] of [...unresolved.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${String(slugs.length).padStart(3)}x  ${ref.slice(0, 90)}`);
    console.log(`        on: ${[...new Set(slugs)].slice(0, 4).join(', ')}`);
  }
}
if (missingFiles.size) {
  console.log(`\n${missingFiles.size} image paths point at files that do not exist:`);
  for (const [src, slugs] of missingFiles) console.log(`  ${src}  (${[...new Set(slugs)].join(', ')})`);
}
if (uncaptioned.length) {
  console.log(`\n${uncaptioned.length} images have no caption:`);
  uncaptioned.slice(0, 10).forEach(x => console.log(`  ${x}`));
}

const problems = unresolved.size + missingFiles.size + uncaptioned.length;
if (!problems) console.log('\nEverything resolves: every citation links, every image exists and is captioned.');
if (strict && problems) process.exitCode = 1;
