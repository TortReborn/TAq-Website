#!/usr/bin/env node
/**
 * Fetch Visage skin renders for Chronicles player articles.
 *
 *   node scripts/fetch-player-renders.mjs <slug>:<ign> [<slug>:<ign> ...]
 *   node scripts/fetch-player-renders.mjs --dry-run <slug>:<ign>
 *
 * Resolves each in-game name to a UUID through Ashcon, which still answers for
 * accounts that have since been renamed — Mojang's own endpoint does not, and
 * most of these players last logged in years ago. Then pulls the bust render
 * and writes it as webp to public/images/chronicles/media/<slug>-render.webp,
 * recording the resolution in data/wiki/sources/media/player-renders.json.
 *
 * A render shows the account's CURRENT skin, not necessarily the one worn
 * during the period an article covers. Accounts that no longer resolve get no
 * render, and that is recorded rather than guessed at.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/images/chronicles/media');
const MANIFEST = path.join(ROOT, 'data/wiki/sources/media/player-renders.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pairs = args.filter((a) => !a.startsWith('--'));
if (!pairs.length) {
  console.error('usage: fetch-player-renders.mjs [--dry-run] <slug>:<ign> ...');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
manifest.resolved ??= [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const pair of pairs) {
  const idx = pair.lastIndexOf(':');
  const slug = pair.slice(0, idx);
  const ign = pair.slice(idx + 1);
  if (!slug || !ign) { console.error(`skipping malformed pair "${pair}"`); continue; }

  const already = manifest.resolved.find((r) => r.slug === slug);
  if (already && already.status === 'ok') { console.log(`${slug}: already resolved`); continue; }

  let uuid = null, resolvedName = null, status = 'unresolved';
  try {
    const res = await fetch(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(ign)}`, {
      headers: { 'User-Agent': 'TAqChronicles/1.0' },
    });
    if (res.ok) {
      const j = await res.json();
      uuid = j.uuid;
      resolvedName = j.username;
      status = 'ok';
    } else {
      status = `no account (${res.status})`;
    }
  } catch (e) {
    status = `lookup failed: ${e.message.slice(0, 60)}`;
  }

  if (status !== 'ok') {
    console.log(`${slug.padEnd(18)} ${ign.padEnd(18)} ${status}`);
    manifest.resolved = manifest.resolved.filter((r) => r.slug !== slug);
    manifest.resolved.push({ slug, ign, uuid: null, status });
    await sleep(400);
    continue;
  }

  const render = `https://visage.surgeplay.com/bust/512/${uuid}`;
  if (!dryRun) {
    const img = await fetch(render, { headers: { 'User-Agent': 'TAqChronicles/1.0' } });
    if (!img.ok) {
      console.log(`${slug.padEnd(18)} ${ign.padEnd(18)} render HTTP ${img.status}`);
      await sleep(400);
      continue;
    }
    const buf = Buffer.from(await img.arrayBuffer());
    fs.mkdirSync(OUT, { recursive: true });
    await sharp(buf).webp({ quality: 90 }).toFile(path.join(OUT, `${slug}-render.webp`));
  }

  manifest.resolved = manifest.resolved.filter((r) => r.slug !== slug);
  manifest.resolved.push({ slug, ign, resolvedName, uuid, status: 'ok', render });
  console.log(`${slug.padEnd(18)} ${ign.padEnd(18)} ok  ${resolvedName !== ign ? `(now "${resolvedName}") ` : ''}${uuid}`);
  await sleep(400);
}

if (!dryRun) {
  manifest.resolved.sort((a, b) => a.slug.localeCompare(b.slug));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');
  console.log('\nmanifest updated');
}
