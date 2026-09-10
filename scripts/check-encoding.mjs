#!/usr/bin/env node
/**
 * Fail on text that has been through a CP1252 round trip.
 *
 *   node scripts/check-encoding.mjs [--strict] [--fix]
 *
 * A UTF-8 file read as Windows-1252 and written back out as UTF-8 keeps every
 * character but replaces each non-ASCII one with the two or three characters
 * its bytes happen to spell in that codepage. An em dash becomes "â€”", a
 * right quote "â€™", "é" becomes "Ã©". Nothing errors, the file still parses,
 * and the damage only becomes visible when a reader opens the page.
 *
 * This is not hypothetical here. `data/chronicle/drafts/2020-2026-additions.json`
 * carried 38 such sequences — thirty-four em dashes and four curly quotes —
 * through several rounds of review, and would have published them verbatim the
 * moment those war descriptions were promoted. It survived because every check
 * we had asks whether a claim is true, and a mangled dash is not a false claim.
 *
 * The exposure is ordinary: PowerShell's Set-Content writes the machine's ANSI
 * codepage unless told otherwise, and this repo is edited on Windows. Any tool
 * swapped into the chain that does not pin utf8 reintroduces it. So the property
 * is checked rather than hoped for.
 *
 * --fix repairs the sequences in place. It is deliberately conservative: it only
 * rewrites a file when the repair is unambiguous and the result still parses.
 */
import fs from 'fs';
import path from 'path';

const strict = process.argv.includes('--strict');
const fix = process.argv.includes('--fix');
const ROOT = process.cwd();
const DIRS = ['data', 'lib', 'components', 'app', 'scripts', 'docs'];
const EXT = /\.(json|md|ts|tsx|mjs|cjs|js)$/;

/**
 * The mojibake for every character we plausibly write: the UTF-8 bytes of the
 * character, each byte decoded as CP1252. Keyed by the damaged string.
 */
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};
const byteToChar = (b) => CP1252[b] ?? String.fromCharCode(b);

/** Characters worth guarding: the punctuation and accents this corpus uses. */
const GUARDED = [
  '—', '–', '‘', '’', '“', '”', '…', '•',
  ' ', 'é', 'è', 'ê', 'ü', 'ö', 'ä', 'ñ',
  'ç', 'å', 'ø', 'í', 'á', 'ó', 'ú', '°',
];

const REPAIRS = new Map();
for (const ch of GUARDED) {
  const damaged = [...Buffer.from(ch, 'utf8')].map(byteToChar).join('');
  // A one-character result means the round trip was lossless and there is
  // nothing to detect; skip rather than register an identity rule.
  if (damaged !== ch && damaged.length > 1) REPAIRS.set(damaged, ch);
}
// Longest first, so "â€”" is tried before any shorter prefix of it.
const ORDERED = [...REPAIRS.entries()].sort((a, b) => b[0].length - a[0].length);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.next') continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) walk(fp, out);
    else if (EXT.test(e.name)) out.push(fp);
  }
  return out;
}

const files = DIRS.filter(d => fs.existsSync(path.join(ROOT, d)))
  .flatMap(d => walk(path.join(ROOT, d)));

let hits = 0;
let repaired = 0;
const offenders = [];

for (const fp of files) {
  let text;
  try { text = fs.readFileSync(fp, 'utf8'); } catch { continue; }
  // This file names the damaged sequences in order to detect them.
  if (path.resolve(fp) === path.resolve(new URL(import.meta.url).pathname.slice(1))) continue;
  if (fp.endsWith('check-encoding.mjs') || fp.endsWith('check-encoding.test.ts')) continue;

  let found = 0;
  for (const [bad] of ORDERED) found += text.split(bad).length - 1;
  if (!found) continue;

  hits += found;
  const rel = path.relative(ROOT, fp);
  offenders.push({ rel, found });

  if (fix) {
    const bom = text.charCodeAt(0) === 0xfeff;
    let body = bom ? text.slice(1) : text;
    for (const [bad, good] of ORDERED) body = body.split(bad).join(good);
    // Never leave a JSON file we cannot re-read.
    if (fp.endsWith('.json')) {
      try { JSON.parse(body); }
      catch { console.error(`  ${rel}: repair would break JSON — left alone`); continue; }
    }
    fs.writeFileSync(fp, (bom ? '﻿' : '') + body, 'utf8');
    repaired += found;
  }
}

if (!hits) {
  console.log(`${files.length} files, no CP1252 round-trip damage.`);
  process.exit(0);
}

for (const o of offenders) console.log(`  ${String(o.found).padStart(4)}  ${o.rel}`);
if (fix) {
  console.log(`\nrepaired ${repaired} sequence(s) across ${offenders.length} file(s).`);
  process.exit(0);
}
console.log(`\n${hits} damaged sequence(s) in ${offenders.length} file(s).`);
console.log('These publish verbatim — "â€”" where somebody wrote an em dash.');
console.log('Run with --fix to repair, then re-read the diff before committing.');
process.exit(strict ? 1 : 0);
