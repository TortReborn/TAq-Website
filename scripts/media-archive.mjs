#!/usr/bin/env node
/**
 * Media archive — images for the Chronicle wiki, with provenance.
 *
 * The wiki is text-heavy; guild emblems, alliance logos and territory maps sit
 * in forum posts whose image hosts eventually die. This mirrors
 * source-archive.mjs: fetch once, keep the original as evidence, generate a
 * web-ready derivative, and record where every image came from so that an
 * article can cite it.
 *
 *   node scripts/media-archive.mjs mine <source-id>...   find image URLs in archived HTML
 *   node scripts/media-archive.mjs add <url> --subject <wiki-slug> --caption "..."
 *        [--from <source-id>] [--wayback YYYYMMDD] [--credit "poster"] [--id X]
 *   node scripts/media-archive.mjs list [--subject <slug>]
 *   node scripts/media-archive.mjs verify
 *
 * Layout:
 *   data/wiki/sources/media/<id>.<ext>              original (evidence)
 *   data/wiki/sources/media/manifest.json           provenance records
 *   public/images/chronicles/media/<id>.webp   what articles reference
 *
 * RULES: game and forum content only. No real-life photographs, no personal
 * information, nothing from outside the game context. Anything doubtful gets
 * `excluded` set in the manifest and its web derivative removed.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC_RAW = path.join(ROOT, 'data', 'wiki', 'sources', 'raw');
const MEDIA = path.join(ROOT, 'data', 'wiki', 'sources', 'media');
const WEB_OUT = path.join(ROOT, 'public', 'images', 'chronicle', 'media');
const MANIFEST = path.join(MEDIA, 'manifest.json');
const UA = 'Mozilla/5.0 (compatible; TAqChronicles/1.0)';

const flag = (args, name, fb) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fb : args[i + 1];
};

function load() {
  if (!fs.existsSync(MANIFEST)) {
    return {
      $comment: 'Images for the Chronicle wiki with provenance. Managed by scripts/media-archive.mjs. Game and forum content only; entries with an "excluded" field are kept as evidence but never published.',
      media: {},
    };
  }
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

function save(m) {
  const sorted = {};
  for (const k of Object.keys(m.media).sort()) sorted[k] = m.media[k];
  m.media = sorted;
  fs.mkdirSync(MEDIA, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n');
}

/** Pull candidate image URLs out of already-archived HTML — no network needed. */
function cmdMine(args) {
  const ids = args.filter(a => !a.startsWith('--'));
  const seen = new Set();
  for (const id of ids) {
    const file = path.join(SRC_RAW, id + '.html.gz');
    if (!fs.existsSync(file)) {
      console.error('no raw copy for ' + id);
      continue;
    }
    const html = zlib.gunzipSync(fs.readFileSync(file)).toString('utf8');
    const found = [
      ...[...html.matchAll(/<img[^>]+(?:data-url|data-src|src)="([^"]+)"/gi)].map(m => m[1]),
      ...[...html.matchAll(/href="(https?:\/\/[^"]+\.(?:png|jpe?g|gif|webp))"/gi)].map(m => m[1]),
    ];
    for (let u of found) {
      if (u.startsWith('//')) u = 'https:' + u;
      if (!/^https?:\/\//.test(u)) continue;
      // Skip forum furniture: avatars, smilies, theme assets, UI sprites
      if (/\/(avatars?|smilies|styles|xenforo)\//i.test(u)) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      console.log(id + '\t' + u);
    }
  }
  console.log('\n' + seen.size + ' candidate image URLs (avatars and forum furniture filtered out)');
}

async function cmdAdd(args) {
  const url = args[0];
  if (!url || url.startsWith('--')) {
    throw new Error('usage: add <url> --subject <slug> --caption "..." [--from <source-id>]');
  }
  const subject = flag(args, 'subject');
  const caption = flag(args, 'caption');
  if (!subject || !caption) {
    throw new Error('--subject and --caption are required: an image with no stated subject or caption is not usable');
  }

  const wayback = flag(args, 'wayback');
  let fetchUrl = url;
  let captured = null;
  if (wayback) {
    const api = 'https://archive.org/wayback/available?url=' + encodeURIComponent(url) + '&timestamp=' + wayback;
    const res = await fetch(api, { headers: { 'User-Agent': UA } });
    const snap = res.ok ? (await res.json())?.archived_snapshots?.closest : null;
    if (!snap?.available) throw new Error('no Wayback capture near ' + wayback + ' for ' + url);
    fetchUrl = snap.url.replace(/^http:/, 'https:');
    captured = snap.timestamp;
  }

  const res = await fetch(fetchUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + fetchUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error('not an image (' + (type || 'unknown type') + ')');
  const ext = type.includes('png') ? 'png'
    : type.includes('jpeg') ? 'jpg'
    : type.includes('gif') ? 'gif'
    : type.includes('webp') ? 'webp' : 'bin';

  const id = flag(args, 'id') || subject + '-' + crypto.createHash('sha1').update(url).digest('hex').slice(0, 8);
  fs.mkdirSync(MEDIA, { recursive: true });
  fs.writeFileSync(path.join(MEDIA, id + '.' + ext), buf);

  fs.mkdirSync(WEB_OUT, { recursive: true });
  const info = await sharp(buf).rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 86 })
    .toFile(path.join(WEB_OUT, id + '.webp'));

  const m = load();
  m.media[id] = {
    subject,
    caption,
    url,
    fetchedFrom: fetchUrl !== url ? fetchUrl : undefined,
    waybackCapture: captured || undefined,
    fromSource: flag(args, 'from') || undefined,
    credit: flag(args, 'credit') || undefined,
    file: id + '.' + ext,
    web: '/images/chronicles/media/' + id + '.webp',
    width: info.width,
    height: info.height,
    bytes: buf.length,
    sha256: crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16),
    addedAt: new Date().toISOString(),
  };
  save(m);
  console.log('added ' + id + ' (' + info.width + 'x' + info.height + ', ' + Math.round(info.size / 1024) + 'KB webp) for ' + subject);
  console.log('  markdown: !' + '[' + caption + '](' + m.media[id].web + ')');
}

function cmdList(args) {
  const subject = flag(args, 'subject');
  const m = load();
  const rows = Object.entries(m.media).filter(([, v]) => !subject || v.subject === subject);
  for (const [id, v] of rows) {
    console.log(id.padEnd(40) + String(v.subject).padEnd(26) + (v.excluded ? 'EXCLUDED' : v.web));
  }
  console.log('\n' + rows.length + ' images' + (subject ? ' for ' + subject : ''));
}

function cmdVerify() {
  const m = load();
  let bad = 0;
  for (const [id, v] of Object.entries(m.media)) {
    if (!fs.existsSync(path.join(MEDIA, v.file))) { console.error('missing original: ' + id); bad++; }
    if (!v.excluded && !fs.existsSync(path.join(WEB_OUT, id + '.webp'))) { console.error('missing web copy: ' + id); bad++; }
    if (!v.caption || !v.subject) { console.error('missing caption or subject: ' + id); bad++; }
  }
  console.log(bad ? bad + ' problems' : Object.keys(m.media).length + ' images, all present with subject and caption');
  if (bad) process.exitCode = 1;
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'mine') cmdMine(rest);
  else if (cmd === 'add') await cmdAdd(rest);
  else if (cmd === 'list') cmdList(rest);
  else if (cmd === 'verify') cmdVerify();
  else {
    console.error('usage: media-archive.mjs <mine|add|list|verify> [...]');
    process.exitCode = 2;
  }
} catch (e) {
  console.error('FAIL: ' + e.message);
  process.exitCode = 1;
}
