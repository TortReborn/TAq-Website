#!/usr/bin/env node
/**
 * Source archive — a local, citable corpus for the Chronicles wiki.
 *
 * Every page we consult for guild history gets fetched ONCE and stored in
 * data/sources/, so drafting and fact-checking read from disk instead of the
 * network. Forum threads rot, Wayback is slow and sometimes blocked, and
 * research agents shouldn't re-fetch what we already have.
 *
 *   node scripts/source-archive.mjs add <url> [--id X] [--kind K] [--note "..."]
 *   node scripts/source-archive.mjs add <url> --wayback 20210704   (nearest capture)
 *   node scripts/source-archive.mjs list [--kind forum-thread]
 *   node scripts/source-archive.mjs show <id>
 *   node scripts/source-archive.mjs search <regex> [--kind K]
 *   node scripts/source-archive.mjs verify
 *
 * Layout:
 *   data/sources/index.json   manifest: id -> {url, kind, title, fetchedAt, ...}
 *   data/sources/docs/<id>.md extracted text with YAML-ish frontmatter
 *   data/sources/raw/<id>.html.gz  original HTML (re-extract without re-fetching)
 *
 * Extraction is best-effort: XenForo forum threads become per-post sections
 * (author, date, post number, body); everything else falls back to a generic
 * tag strip. The raw HTML is kept so a better extractor can be run later.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'data', 'sources');
const DOCS = path.join(ROOT, 'docs');
const RAW = path.join(ROOT, 'raw');
const INDEX = path.join(ROOT, 'index.json');

const UA = 'Mozilla/5.0 (compatible; TAqChronicles/1.0; +https://theaquarium.wynn)';

// ---------------------------------------------------------------------------
// manifest
// ---------------------------------------------------------------------------

function loadIndex() {
  if (!fs.existsSync(INDEX)) return { $comment: 'Archived sources for the Chronicles wiki. Managed by scripts/source-archive.mjs — add entries with `add`, never by hand.', sources: {} };
  return JSON.parse(fs.readFileSync(INDEX, 'utf8'));
}

function saveIndex(idx) {
  const sorted = {};
  for (const key of Object.keys(idx.sources).sort()) sorted[key] = idx.sources[key];
  idx.sources = sorted;
  fs.mkdirSync(ROOT, { recursive: true });
  fs.writeFileSync(INDEX, JSON.stringify(idx, null, 1) + '\n');
}

/** Readable, stable id from a URL: forums threads keep their number and page. */
function deriveId(url) {
  const u = new URL(url);
  const wb = u.hostname === 'web.archive.org' ? url.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\w*\//, '') : null;
  if (wb) return deriveId(wb);
  if (/forums\.wynncraft\.com$/.test(u.hostname)) {
    const thread = u.pathname.match(/threads\/(?:[^/]*\.)?(\d+)/);
    const page = u.pathname.match(/page-(\d+)/);
    if (thread) return `thread-${thread[1]}${page ? `-p${String(page[1]).padStart(2, '0')}` : ''}`;
  }
  const host = u.hostname.replace(/^www\./, '').replace(/\./g, '-');
  const slug = (u.pathname + u.search)
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'index';
  return `${host}-${slug}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// html -> text
// ---------------------------------------------------------------------------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…',
  mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '- ')
      .replace(/<img\b[^>]*\balt="([^"]*)"[^>]*>/gi, '[image: $1]')
      .replace(/<img\b[^>]*\bsrc="([^"]*)"[^>]*>/gi, '[image: $1]')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Drop the Wayback toolbar and its rewriting wrappers. */
function unwrapWayback(html) {
  return html
    .replace(/<!--\s*BEGIN WAYBACK TOOLBAR INSERT\s*-->[\s\S]*?<!--\s*END WAYBACK TOOLBAR INSERT\s*-->/gi, ' ')
    .replace(/<div\s+id="wm-ipp[\s\S]*?<\/div>\s*(?=<)/i, ' ');
}

/**
 * XenForo threads (forums.wynncraft.com): one section per post, keeping author,
 * timestamp and post number — the citation unit our articles use ("thread 237070
 * p3 #45"). Handles both forum generations: XF1 wraps posts in
 * `<li id="post-N" data-author>` with a `.messageText` body ending at
 * `messageTextEndMarker`; XF2 uses `<article class="message">` with `.bbWrapper`.
 */
function extractXenForo(html) {
  const blocks = [];

  // XF1: split on post list items (regex can't match the nested </li>, so slice
  // each block up to the start of the next one).
  const xf1 = [...html.matchAll(/<li id="post-(\d+)"[^>]*data-author="([^"]*)"/gi)];
  if (xf1.length) {
    for (let i = 0; i < xf1.length; i++) {
      const start = xf1[i].index;
      const end = i + 1 < xf1.length ? xf1[i + 1].index : html.length;
      const block = html.slice(start, end);
      const author = decodeEntities(xf1[i][2]);
      const date = (block.match(/class="DateTime"[^>]*title="([^"]*)"/i)
        ?? block.match(/<abbr[^>]*class="DateTime"[^>]*>([^<]*)</i)
        ?? [])[1] ?? '';
      const num = (block.match(/class="[^"]*postNumber[^"]*"[^>]*>#(\d+)</i) ?? [])[1] ?? '';
      const bodyStart = block.search(/class="messageText\b/i);
      let body = '';
      if (bodyStart !== -1) {
        const from = block.indexOf('>', bodyStart) + 1;
        const marker = block.indexOf('messageTextEndMarker', from);
        const to = marker === -1 ? block.length : block.lastIndexOf('<div', marker);
        body = stripTags(block.slice(from, to));
      }
      if (body) blocks.push({ num, author, date, body });
    }
  }

  // XF2
  if (!blocks.length) {
    const articleRe = /<article\b[^>]*class="[^"]*\bmessage\b[^"]*"[^>]*>[\s\S]*?<\/article>/gi;
    let m;
    while ((m = articleRe.exec(html)) !== null) {
      const block = m[0];
      const author = decodeEntities((block.match(/data-author="([^"]*)"/i) ?? [])[1] ?? 'unknown');
      const date = (block.match(/<time\b[^>]*datetime="([^"]*)"/i) ?? [])[1] ?? '';
      const num = (block.match(/>#(\d+)<\/a>/) ?? [])[1] ?? '';
      const bodyMatch = block.match(/<div\b[^>]*class="[^"]*\bbbWrapper\b[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<div\b[^>]*class="[^"]*message-signature)/i)
        ?? block.match(/<div\b[^>]*class="[^"]*\bbbWrapper\b[^"]*"[^>]*>([\s\S]*)/i);
      const body = stripTags(bodyMatch ? bodyMatch[1] : '');
      if (body) blocks.push({ num, author, date, body });
    }
  }

  if (!blocks.length) return null;
  return blocks
    .map(b => `### post ${b.num ? `#${b.num} ` : ''}— ${b.author}${b.date ? ` — ${b.date}` : ''}\n\n${b.body}`)
    .join('\n\n---\n\n');
}

function extractText(html, url) {
  const clean = unwrapWayback(html);
  const original = url.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\w*\//, '');
  if (/forums\.wynncraft\.com/.test(original)) {
    const posts = extractXenForo(clean);
    if (posts) return posts;
  }
  // Generic: prefer <main>/<article>/<body> if present
  const scoped = clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)
    ?? clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)
    ?? clean.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return stripTags(scoped ? scoped[1] : clean);
}

function extractTitle(html) {
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return t ? decodeEntities(t[1]).replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

// ---------------------------------------------------------------------------
// fetching
// ---------------------------------------------------------------------------

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { html: await res.text(), finalUrl: res.url };
}

/**
 * Wayback indexes the exact URL string, and XenForo's canonical thread URL
 * carries a slug (/threads/some-title.246617/). A bare /threads/246617/ has no
 * captures, so resolve it against the live site first — the redirect target is
 * what the archive holds.
 */
async function canonicalize(url) {
  if (!/forums\.wynncraft\.com\/threads\/\d+/.test(url)) return url;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (res.ok && res.url && res.url !== url) return res.url;
  } catch { /* offline or dead thread — fall through to CDX */ }
  return url;
}

/** Nearest capture via the availability API, falling back to a CDX lookup. */
async function resolveWayback(url, timestamp) {
  const canonical = await canonicalize(url);
  for (const candidate of [...new Set([canonical, url])]) {
    const api = `https://archive.org/wayback/available?url=${encodeURIComponent(candidate)}&timestamp=${timestamp}`;
    const res = await fetch(api, { headers: { 'User-Agent': UA } }).catch(() => null);
    const snap = res?.ok ? (await res.json())?.archived_snapshots?.closest : null;
    if (snap?.available) return { url: snap.url.replace(/^http:/, 'https:'), timestamp: snap.timestamp };
  }

  // CDX fallback: list captures for the thread and pick the closest by timestamp
  const thread = (canonical.match(/threads\/(?:[^/]*\.)?(\d+)/) ?? [])[1];
  if (thread) {
    const page = (canonical.match(/page-(\d+)/) ?? [])[1];
    const cdx = `http://web.archive.org/cdx/search/cdx?url=forums.wynncraft.com/threads/*&output=json&fl=timestamp,original&collapse=digest&limit=20000&filter=original:.*[./]${thread}/${page ? `page-${page}` : ''}.*`;
    const res = await fetch(cdx, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (res?.ok) {
      const rows = await res.json().catch(() => []);
      const data = rows.slice(1);
      if (data.length) {
        const want = String(timestamp).padEnd(14, '0');
        data.sort((a, b) => Math.abs(Number(a[0]) - Number(want)) - Math.abs(Number(b[0]) - Number(want)));
        return { url: `https://web.archive.org/web/${data[0][0]}/${data[0][1]}`, timestamp: data[0][0] };
      }
    }
  }
  throw new Error(`no Wayback capture near ${timestamp} for ${url}`);
}

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

function flag(args, name, fallback = undefined) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

async function cmdAdd(args) {
  const url = args[0];
  if (!url || url.startsWith('--')) throw new Error('usage: add <url> [--id X] [--kind K] [--note "..."] [--wayback TS]');
  const wayback = flag(args, 'wayback');
  const force = args.includes('--force');
  const keepRaw = !args.includes('--no-raw');

  // A capture is its own source: same URL, different point in time (that is the
  // whole value of an archived copy — the megalist before vs after the July 2022
  // alliance wipe). Suffix the id so captures never collide with the live page.
  const id = flag(args, 'id') ?? (wayback ? `${deriveId(url)}-wb${String(wayback).slice(0, 8)}` : deriveId(url));
  const idx = loadIndex();
  if (idx.sources[id] && !force) {
    console.log(`already archived: ${id} (${idx.sources[id].url}) — pass --force to refetch`);
    return;
  }

  let fetchUrl = url;
  let capturedAt = null;
  if (wayback) {
    const snap = await resolveWayback(url, wayback);
    fetchUrl = snap.url;
    capturedAt = snap.timestamp;
    console.log(`wayback capture ${snap.timestamp}`);
  }

  const { html, finalUrl } = await fetchText(fetchUrl);
  const text = extractText(html, finalUrl);
  const title = extractTitle(html);
  const sha = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);

  fs.mkdirSync(DOCS, { recursive: true });
  const frontmatter = [
    '---',
    `id: ${id}`,
    `url: ${url}`,
    fetchUrl !== url ? `fetched_from: ${fetchUrl}` : null,
    capturedAt ? `wayback_capture: ${capturedAt}` : null,
    `kind: ${flag(args, 'kind') ?? guessKind(url)}`,
    title ? `title: ${JSON.stringify(title)}` : null,
    `fetched_at: ${new Date().toISOString()}`,
    `raw_sha256: ${sha}`,
    flag(args, 'note') ? `note: ${JSON.stringify(flag(args, 'note'))}` : null,
    '---',
  ].filter(Boolean).join('\n') + '\n\n';
  fs.writeFileSync(path.join(DOCS, `${id}.md`), frontmatter + text + '\n');

  if (keepRaw) {
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(path.join(RAW, `${id}.html.gz`), zlib.gzipSync(Buffer.from(html, 'utf8'), { level: 9 }));
  }

  idx.sources[id] = {
    url,
    fetchedFrom: fetchUrl !== url ? fetchUrl : undefined,
    waybackCapture: capturedAt ?? undefined,
    kind: flag(args, 'kind') ?? guessKind(url),
    title: title || undefined,
    fetchedAt: new Date().toISOString(),
    textChars: text.length,
    rawSha256: sha,
    note: flag(args, 'note') ?? undefined,
  };
  saveIndex(idx);
  console.log(`archived ${id}: ${text.length} chars of text${keepRaw ? ' (+ raw html)' : ''}`);
  return { id, textSha: crypto.createHash('sha256').update(text).digest('hex') };
}

/** Remove a source completely — doc, raw copy and manifest entry. */
function removeSource(id) {
  for (const f of [path.join(DOCS, `${id}.md`), path.join(RAW, `${id}.html.gz`)]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  const idx = loadIndex();
  delete idx.sources[id];
  saveIndex(idx);
}

/**
 * Archive every page of a forum thread. Page count comes from XenForo's page
 * navigation; each page is stored as its own source (thread-NNN, thread-NNN-p02…)
 * so citations can point at the page a quote actually lives on.
 */
async function cmdThread(args) {
  const ref = args[0];
  if (!ref) throw new Error('usage: thread <thread-number|url> [--max N] [--note "..."] [--force]');
  const base = /^\d+$/.test(ref)
    ? `https://forums.wynncraft.com/threads/${ref}/`
    : ref.replace(/page-\d+\/?$/, '');
  const max = Number(flag(args, 'max') ?? 40);

  const { html } = await fetchText(base);
  // XF1 "Page 1 of 9" / XF2 pageNav-page links
  const counts = [...html.matchAll(/page-(\d+)/g)].map(m => Number(m[1]));
  const nav = (html.match(/Page \d+ of (\d+)/i) ?? [])[1];
  const pages = Math.min(max, Math.max(nav ? Number(nav) : 1, counts.length ? Math.max(...counts) : 1));
  console.log(`${base} — ${pages} page(s)`);

  // XenForo serves the LAST page for any out-of-range page number, so a
  // too-high page count would otherwise store N copies of the final page.
  // Stop as soon as a page's text repeats the one before it.
  let lastSha = null;
  for (let p = 1; p <= pages; p++) {
    const url = p === 1 ? base : `${base}page-${p}`;
    try {
      const result = await cmdAdd([url, ...args.slice(1)]);
      if (result) {
        if (lastSha && result.textSha === lastSha) {
          removeSource(result.id);
          console.log(`  page ${p} repeats page ${p - 1} — stopping (thread has ${p - 1} pages)`);
          break;
        }
        lastSha = result.textSha;
      }
    } catch (e) {
      console.error(`  page ${p} failed: ${e.message}`);
    }
    if (p < pages) await new Promise(r => setTimeout(r, 1200)); // be polite
  }
}

function guessKind(url) {
  if (/forums\.wynncraft\.com/.test(url)) return 'forum-thread';
  if (/titantimes|titansvalor/.test(url)) return 'titan-times';
  if (/wynncraft\.wiki|wiki\.gg/.test(url)) return 'wiki';
  if (/api\.wynncraft/.test(url)) return 'api';
  if (/github\.com|githubusercontent/.test(url)) return 'repository';
  if (/youtube\.com|youtu\.be/.test(url)) return 'video';
  return 'web';
}

function cmdList(args) {
  const kind = flag(args, 'kind');
  const idx = loadIndex();
  const rows = Object.entries(idx.sources).filter(([, s]) => !kind || s.kind === kind);
  for (const [id, s] of rows) {
    console.log(`${id.padEnd(32)} ${String(s.kind).padEnd(13)} ${String(s.textChars).padStart(7)}  ${s.title ?? s.url}`);
  }
  console.log(`\n${rows.length} sources${kind ? ` of kind ${kind}` : ''}`);
}

function cmdShow(args) {
  const file = path.join(DOCS, `${args[0]}.md`);
  if (!fs.existsSync(file)) throw new Error(`not archived: ${args[0]}`);
  process.stdout.write(fs.readFileSync(file, 'utf8'));
}

function cmdSearch(args) {
  const pattern = args[0];
  if (!pattern) throw new Error('usage: search <regex> [--kind K]');
  const kind = flag(args, 'kind');
  const re = new RegExp(pattern, 'i');
  const idx = loadIndex();
  let hits = 0;
  for (const [id, s] of Object.entries(idx.sources)) {
    if (kind && s.kind !== kind) continue;
    const file = path.join(DOCS, `${id}.md`);
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        console.log(`${id}:${i + 1}: ${lines[i].trim().slice(0, 220)}`);
        hits++;
      }
    }
  }
  console.log(`\n${hits} matching lines`);
}

function cmdVerify() {
  const idx = loadIndex();
  let missing = 0;
  for (const id of Object.keys(idx.sources)) {
    if (!fs.existsSync(path.join(DOCS, `${id}.md`))) { console.error(`MISSING doc: ${id}`); missing++; }
  }
  const known = new Set(Object.keys(idx.sources));
  for (const f of fs.existsSync(DOCS) ? fs.readdirSync(DOCS) : []) {
    const id = f.replace(/\.md$/, '');
    if (!known.has(id)) { console.error(`UNINDEXED doc: ${id}`); missing++; }
  }
  console.log(missing ? `\n${missing} problems` : `${known.size} sources, all present and indexed`);
  if (missing) process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'add') await cmdAdd(rest);
  else if (cmd === 'thread') await cmdThread(rest);
  else if (cmd === 'list') cmdList(rest);
  else if (cmd === 'show') cmdShow(rest);
  else if (cmd === 'search') cmdSearch(rest);
  else if (cmd === 'verify') cmdVerify();
  else {
    console.error('usage: source-archive.mjs <add|thread|list|show|search|verify> [...]');
    process.exit(2);
  }
} catch (e) {
  console.error(`FAIL: ${e.message}`);
  // exitCode rather than exit(): let keep-alive sockets close on their own,
  // otherwise Node 24 trips a libuv assertion on teardown.
  process.exitCode = 1;
}
