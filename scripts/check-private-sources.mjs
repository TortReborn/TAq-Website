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
 *   4. A withdrawn source stays down: no document, url, images or source
 *      folder, and no article embeds its images. Articles may still cite it.
 *   5. A source that describes itself as private can't pass under another
 *      kind. It must be private, withdrawn, or carry an explicit `consent` note.
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

// 4 — a withdrawn source stays down
const articleData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/wiki/seed-articles.json'), 'utf8')).articles;
for (const [id, v] of Object.entries(sources).filter(([, s]) => s.withdrawn)) {
  const paths = [
    path.join('data/wiki/sources/docs', `${id}.md`),
    path.join('data/wiki/sources/raw', `${id}.html.gz`),
    path.join('data/wiki/research/dossiers', `${id}.md`),
    path.join('public/images/chronicles', id),
  ];
  for (const dir of v.assetDirs ?? []) {
    paths.push(path.join('data/wiki/sources', dir), path.join('public/images/chronicles', dir));
    for (const a of articleData) {
      if (JSON.stringify(a).includes(`/images/chronicles/${dir}/`)) {
        breaches.push(`${a.slug} embeds an image from withdrawn source ${id}`);
      }
    }
  }
  for (const rel of paths) {
    if (fs.existsSync(path.join(ROOT, rel))) breaches.push(`withdrawn source ${id} still has ${rel}`);
  }
  if (v.url) breaches.push(`withdrawn source ${id} carries a url; it must be empty`);
}

// 5 — a source can't describe itself as private and pass under another kind
const SAYS_PRIVATE = /\bprivate\s+(?:guild\s+|discord\s+)?(?:channel|server|archive|chat|message)s?\b|\bno public url\b/i;
for (const [id, v] of Object.entries(sources)) {
  // discord-export is Tier A: announcement channels, published on purpose.
  if (v.private || v.kind === 'discord-private' || v.kind === 'discord-export' || v.withdrawn || v.consent) continue;
  const doc = path.join(ROOT, 'data/wiki/sources/docs', `${id}.md`);
  const front = fs.existsSync(doc)
    ? (fs.readFileSync(doc, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '').match(/^url:.*$/m)?.[0] ?? ''
    : '';
  if (SAYS_PRIVATE.test(v.url ?? '') || SAYS_PRIVATE.test(front)) {
    breaches.push(`source ${id} describes itself as private but is published as kind "${v.kind ?? 'web'}"`);
  }
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
