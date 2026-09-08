#!/usr/bin/env node
/**
 * Guard the boundary between the private Discord archive and this repo.
 *
 *   node scripts/check-private-sources.mjs           report
 *   node scripts/check-private-sources.mjs --strict  exit non-zero on any breach
 *
 * This repo is public on GitHub and data/wiki/sources/docs/<id>.md is served at
 * /chronicle/references/<id>. Anything from the archive that lands here is
 * published. Three things must stay true:
 *
 *   1. No private source has a document, an url, or images. It resolves to
 *      provenance only.
 *   2. No findings file is tracked by git. They live under docs/, gitignored.
 *   3. No article quotes a private source. The archive is never quoted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const strict = process.argv.includes('--strict');
const breaches = [];

const sources = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/sources/index.json'), 'utf8')).sources;
const privateIds = new Set(
  Object.entries(sources).filter(([, v]) => v.private || v.kind === 'discord-private').map(([k]) => k)
);

// 1 — private sources must not have a document, an url, or images
for (const id of privateIds) {
  const doc = path.join(ROOT, 'data/wiki/sources/docs', `${id}.md`);
  if (fs.existsSync(doc)) breaches.push(`private source ${id} has a published document at ${path.relative(ROOT, doc)}`);
  const raw = path.join(ROOT, 'data/wiki/sources/raw', `${id}.html.gz`);
  if (fs.existsSync(raw)) breaches.push(`private source ${id} has raw capture at ${path.relative(ROOT, raw)}`);
  const imgs = path.join(ROOT, 'public/images/chronicles', id);
  if (fs.existsSync(imgs)) breaches.push(`private source ${id} has images under public/ at ${path.relative(ROOT, imgs)}`);
  if (sources[id].url) breaches.push(`private source ${id} carries a url; it must be empty`);
}

// 2 — findings must never be tracked
let tracked = '';
try {
  tracked = execFileSync('git', ['ls-files', 'docs/discord-findings'], { cwd: ROOT, encoding: 'utf8' });
} catch { /* not a git repo, or git unavailable — the other checks still run */ }
for (const line of tracked.split('\n').filter(Boolean)) {
  breaches.push(`findings file is tracked by git: ${line}`);
}
const findingsDir = path.join(ROOT, 'docs/discord-findings');
const findingsCount = fs.existsSync(findingsDir)
  ? fs.readdirSync(findingsDir).filter(f => f.endsWith('.json')).length
  : 0;

// 3 — no article may quote a private source
const { articles } = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8'));
const QUOTE = /[“”"][^“”"]{15,}[“”"]/;
let privateCitations = 0;
for (const a of articles) {
  for (const line of a.body.split('\n')) {
    const refs = [...line.matchAll(/\{\{cite:([^}|]+)/g)].map(m => m[1].trim());
    const hits = refs.filter(r => privateIds.has(r));
    if (!hits.length) continue;
    privateCitations += hits.length;
    if (QUOTE.test(line)) {
      breaches.push(`${a.slug} quotes a private source (${hits.join(', ')}): ${line.trim().slice(0, 90)}…`);
    }
  }
}

console.log(`${privateIds.size} private sources, ${privateCitations} citations to them, ${findingsCount} findings files (untracked)`);

if (breaches.length) {
  console.error(`\n${breaches.length} breach${breaches.length === 1 ? '' : 'es'} of the archive boundary:`);
  for (const b of breaches) console.error(`  - ${b}`);
  if (strict) process.exit(1);
} else {
  console.log('Archive boundary intact.');
}
