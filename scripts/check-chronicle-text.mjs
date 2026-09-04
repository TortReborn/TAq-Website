#!/usr/bin/env node
/**
 * Style check for chronicle text held in the DATABASE — alliance and event
 * descriptions, which appear on the map and the timeline.
 *
 *   node scripts/check-chronicle-text.mjs            # dev (TEST_DB_*)
 *   node scripts/check-chronicle-text.mjs --prod     # prod (DB_*)
 *   node scripts/check-chronicle-text.mjs --strict   # non-zero exit on errors
 *
 * check-article-style.mjs reads data/wiki/seed-articles.json and so never saw
 * these. That gap let the banned "quiet-territory exchanges" coinage survive in
 * eight event descriptions, and a claim that one guild was "driven to zero
 * territories" that its own article contradicts, long after both were fixed in
 * the wiki. Same rules, other half of the corpus.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const prod = args.includes('--prod');
const strict = args.includes('--strict');

for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const env = (n) => (prod ? process.env[n] : process.env[`TEST_${n}`]);
const pool = new pg.Pool({
  host: env('DB_HOST'),
  port: Number(env('DB_PORT') || 5432),
  user: env('DB_LOGIN'),
  password: env('DB_PASS'),
  database: env('DB_DATABASE'),
  ssl: env('DB_SSLMODE') === 'disable' ? undefined : { rejectUnauthorized: false },
  max: 1,
});

// The same bans the wiki prose is held to.
const BANNED = [
  [/quiet[- ]territor/i, 'banned jargon "quiet territor…" — write "territory exchanges"'],
  [/FFA[- ]cluster/i, 'banned jargon "FFA-cluster"'],
  [/\bexchange data\b|\bthe capture log\b|\bmap[- ]data analysis\b/i, 'research-layer vocabulary'],
  [/\bthe chronicle('s)? (database|corpus|records?|sources?)\b/i, 'talks about the chronicle database'],
  [/[\d,]+\s*\(\s*[\d,]+\s*(total|unfiltered)\s*\)/i, 'filtered/unfiltered number pair — give one figure'],
  [/\bwe\b|\bour\b/i, 'first person'],
];

const WARN = [
  [/\bongoing\.\s*$/i, 'ends with a bare "Ongoing." — scope it ("as of <date>") or leave it to the timeline badge'],
  [/\baccording to\b|\bmap[- ]data\b|\bwayback\b/i, 'in-prose sourcing — provenance belongs in the article, not the timeline blurb'],
];

let errors = 0, warns = 0;

// A source may say anything, so quotations are exempt. These blurbs quote with
// single quotes, and missing that reads a newsletter's own "our" as ours.
const proseOf = (text) =>
  (text ?? '')
    .replace(/"[^"\n]{2,600}"/g, ' <q> ')
    .replace(/[“][^”\n]{2,600}[”]/g, ' <q> ')
    .replace(/(^|[\s(—–-])'[^'\n]{2,600}'(?=$|[\s.,;:!?)\]—–-])/g, '$1 <q> ');

const check = (raw, findings) => {
  if (!raw) return;
  const text = proseOf(raw);
  for (const [re, msg] of BANNED) {
    const m = text.match(re);
    if (m) { findings.push(['ERROR', `${msg}  ["${m[0].trim()}"]`]); }
  }
  for (const [re, msg] of WARN) {
    const m = text.match(re);
    if (m) findings.push(['WARN', `${msg}  ["${m[0].trim().slice(0, 40)}"]`]);
  }
};

const rows = [];
const { rows: events } = await pool.query(
  `SELECT title, event_type, description, ends_at FROM chronicle_events ORDER BY starts_at`);
for (const e of events) {
  const findings = [];
  check(e.description, findings);
  // A war with no end renders as "ongoing" on the timeline; make sure the text
  // does not also claim currency it cannot know.
  if (e.event_type === 'war' && e.ends_at === null && /\bongoing\b/i.test(e.description ?? ''))
    findings.push(['WARN', 'says "ongoing" and the timeline already badges it — one or the other']);
  if (findings.length) rows.push({ what: `event: ${e.title}`, findings });
}

const { rows: alliances } = await pool.query(`SELECT name, description FROM chronicle_alliances ORDER BY name`);
for (const a of alliances) {
  const findings = [];
  check(a.description, findings);
  if (findings.length) rows.push({ what: `alliance: ${a.name}`, findings });
}

for (const r of rows) {
  console.log(`\n${r.what}`);
  for (const [sev, msg] of r.findings) {
    console.log(`  ${sev === 'ERROR' ? 'ERROR' : 'warn '} ${msg}`);
    if (sev === 'ERROR') errors++; else warns++;
  }
}

console.log(`\n${prod ? 'PROD' : 'DEV'}: ${events.length} events, ${alliances.length} alliances checked.`);
console.log(`${errors} error(s), ${warns} warning(s).`);
await pool.end();
if (strict && errors) process.exitCode = 1;
