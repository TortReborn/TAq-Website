#!/usr/bin/env node
/**
 * Import a Discord channel export into the source archive.
 *
 *   node scripts/import-discord-export.mjs <file.txt> --id <source-id> \
 *        --title "..." --note "..." [--tier primary] [--images urls.txt] \
 *        [--redact "Real Name=>a member"]... [--reviewed]
 *
 * Guild announcement channels are the best primary record this project has for
 * the years the forums stopped carrying diplomacy: dated, first-person, written
 * by the leadership as things happened. They are also the most dangerous thing
 * we handle, because an archived document is served publicly at
 * /chronicle/references/<id> — whatever lands in docs/ is published.
 *
 * So this script will not write anything until a person has looked. It scans
 * for the categories that must never be published, prints what it found, and
 * exits. You then either redact each one with --redact, or, having read them
 * and judged them harmless, pass --reviewed. There is deliberately no flag that
 * skips the scan.
 *
 * What it does write:
 *   data/wiki/sources/docs/<id>.md        the redacted transcript + frontmatter
 *   data/wiki/sources/index.json          the manifest entry
 *   data/wiki/sources/<id>/               original images, if --images given
 *   data/wiki/sources/<id>/alignment.json image records, unverified
 *   public/images/chronicles/<id>/        web-ready .webp derivatives
 *
 * The alignment file is a scaffold, not a result: every image starts
 * `verified: false` and has to be opened and described before anything cites
 * it. The Federation import found the ordinal alignment held; the storytime
 * corpus found it did not. Assume nothing.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = path.join(ROOT, 'data', 'wiki', 'sources');
const WEB = path.join(ROOT, 'public', 'images', 'chronicles');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const flags = (name) => argv.reduce((a, v, i) => (v === `--${name}` ? [...a, argv[i + 1]] : a), []);
const has = (name) => argv.includes(`--${name}`);

// The first bare token, skipping over each --flag and the value it consumes.
const BOOLEAN_FLAGS = new Set(['reviewed']);
let file = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    if (!BOOLEAN_FLAGS.has(argv[i].slice(2))) i++;
    continue;
  }
  file = argv[i];
  break;
}
const ID = flag('id');
if (!file || !ID) {
  console.error('usage: import-discord-export.mjs <file.txt> --id <source-id> --title "..." --note "..." [--tier primary] [--images urls.txt] [--redact "X=>Y"]... [--reviewed]');
  process.exit(2);
}

let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// --------------------------------------------------------------------------
// Redaction, applied before anything else looks at the text
// --------------------------------------------------------------------------

for (const pair of flags('redact')) {
  const [from, to] = String(pair).split('=>');
  if (!from) continue;
  text = text.split(from).join(to ?? '[redacted]');
}

// A live invite is an ongoing grant of access to somebody's server, not a
// historical fact, and it does not belong in a public archive.
text = text.replace(/https?:\/\/discord\.gg\/[A-Za-z0-9]+/g, '(Discord invite, removed)');
text = text.replace(/https?:\/\/(?:www\.)?discord(?:app)?\.com\/invite\/[A-Za-z0-9]+/g, '(Discord invite, removed)');
// Attachment CDN links carry signed parameters and expire; the image itself is
// archived beside this file, so the URL is noise that also leaks a token.
text = text.replace(/https?:\/\/cdn\.discordapp\.com\/attachments\/\S+/g, '(attachment, archived alongside)');
// A form that collected time zones and schedules from members is a live
// collection endpoint, not a citation.
text = text.replace(/https?:\/\/(?:goo\.gl|forms\.gle|docs\.google\.com\/forms)\/\S+/g, '(form link, removed)');

// --------------------------------------------------------------------------
// The scan. Categories that must never reach a published page.
// --------------------------------------------------------------------------

const CHECKS = [
  ['real-name', /\b(?:my name is|i'?m|i am|call me)\s+[A-Z][a-z]{2,}\b/g],
  ['age', /\b(?:i'?m|i am|aged|age[:\s])\s*(1[0-9]|2[0-9])\b(?!\s*(?:territor|guild|level|lvl))/gi],
  ['country', /\bfrom (?:the )?(?:USA|UK|England|Germany|Canada|Netherlands|Poland|France|Australia|Sweden|Norway|Denmark|Finland|Brazil|Spain|Italy)\b/gi],
  ['timezone', /\b(?:GMT|UTC)\s*[+-]\s*\d{1,2}\b/g],
  ['discord-tag', /\b[\w.]+#\d{4}\b/g],
  ['email', /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi],
  // A message need not state a birthday to expose one. The Kingdom of Phoenixes
  // export set a treasure hunt whose "hint relies on knowing when my birthday is
  // and how old I am" — no data in the text, and a pointer straight at it.
  ['birthday-or-age-reference', /\b(?:my|their|his|her)\s+(?:birthday|birth date|age)\b|\bhow old (?:i|he|she|they) (?:am|is|are)\b/gi],
  // A private Minecraft server address is live infrastructure, not a fact about
  // guild history.
  ['server-address', /\b(?!forums\.|docs\.|www\.|discord)[a-z0-9][a-z0-9-]*\.(?:[a-z0-9-]+\.)*[a-z]{2,}(?::\d{2,5})\b|\b[a-z0-9][a-z0-9-]*\.(?:mcworlds|fluctis|aternos|minehut|serv|apexmc)\.[a-z]{2,}\b/gi],
  ['invite-left', /discord\.gg|discordapp\.com\/invite/gi],
  // Bare capitalised given names are the hard case: the Federation export was
  // clean, the Holders of LE export was not ("bounty on Joshua", "confirm with
  // Catherine"). No pattern separates a real name from an in-game one, so this
  // reports candidates and a person decides. The verbs are ones that address or
  // describe a person, which keeps "Road to Elkurn" out of the list; a name
  // followed by a pronoun clause is the other giveaway.
  ['possible-real-name', /\b(?:tell|ask|thank|thanks to|message|DM|confirm with|congratulate|bounty on|give (?:this|the) \w+ to)\s+([A-Z][a-z]{3,})\b/g],
  ['possible-real-name', /\b([A-Z][a-z]{3,}),?\s+(?:as )?(?:he|she|they)\s+(?:needs?|wants?|said|will|has|is)\b/g],
];

const findings = [];
for (const [kind, re] of CHECKS) {
  for (const m of text.matchAll(re)) {
    const at = text.slice(Math.max(0, m.index - 60), m.index + m[0].length + 60).replace(/\n/g, ' ');
    findings.push({ kind, hit: m[0], context: at });
  }
}

if (findings.length && !has('reviewed')) {
  console.log(`${findings.length} thing(s) in this export need a decision before it can be archived.\n`);
  console.log('An archived document is served publicly at /chronicle/references/<id>.');
  console.log('Redact each with --redact "text=>replacement", or pass --reviewed if');
  console.log('you have read them and they are in-game facts rather than personal data.\n');
  const seen = new Set();
  for (const f of findings) {
    const key = `${f.kind}|${f.hit}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  [${f.kind}] ${JSON.stringify(f.hit)}`);
    console.log(`      …${f.context}…`);
  }
  process.exit(1);
}

// --------------------------------------------------------------------------
// Write the document and the manifest entry
// --------------------------------------------------------------------------

const title = flag('title', ID);
const note = flag('note', '');
const tier = flag('tier', 'primary');
const url = flag('url', '(Discord export — no public URL)');

const frontmatter = [
  '---',
  `id: ${ID}`,
  `url: ${url}`,
  'kind: discord-export',
  `title: ${JSON.stringify(title)}`,
  `fetched_at: ${new Date().toISOString()}`,
  note ? `note: ${JSON.stringify(note)}` : null,
  '---',
].filter(Boolean).join('\n') + '\n\n';

fs.mkdirSync(path.join(SOURCES, 'docs'), { recursive: true });
fs.writeFileSync(path.join(SOURCES, 'docs', `${ID}.md`), frontmatter + text.trim() + '\n');

const idxPath = path.join(SOURCES, 'index.json');
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
idx.sources[ID] = {
  url,
  kind: 'discord-export',
  title,
  fetchedAt: new Date().toISOString(),
  textChars: text.trim().length,
  note: note || undefined,
  tier,
};
const sorted = {};
for (const k of Object.keys(idx.sources).sort()) sorted[k] = idx.sources[k];
idx.sources = sorted;
fs.writeFileSync(idxPath, JSON.stringify(idx, null, 1) + '\n');

console.log(`archived ${ID}: ${text.trim().length} chars`);

// --------------------------------------------------------------------------
// Images: download, derive, and scaffold the alignment record
// --------------------------------------------------------------------------

const imagesFile = flag('images');
if (imagesFile) {
  const urls = fs.readFileSync(imagesFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => /^https?:/.test(s));
  const dir = path.join(SOURCES, ID);
  const webDir = path.join(WEB, ID);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(webDir, { recursive: true });

  // Where each "Image" marker sits in the transcript, so a reviewer can see the
  // message an image was posted under. Ordinal alignment is an assumption and
  // is recorded as one — the storytime corpus proved it can be wrong.
  const lines = text.split('\n');
  const markers = [];
  lines.forEach((l, i) => { if (l.trim() === 'Image') markers.push(i); });

  const records = [];
  for (let n = 0; n < urls.length; n++) {
    const res = await fetch(urls[n]);
    if (!res.ok) { console.log(`  image ${n + 1}: HTTP ${res.status}, skipped`); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = (urls[n].match(/\.(png|jpe?g|gif|webp)/i) ?? [, 'png'])[1].toLowerCase();
    const base = `${ID}-${String(n + 1).padStart(2, '0')}`;
    fs.writeFileSync(path.join(dir, `${base}.${ext}`), buf);
    await sharp(buf, { animated: ext === 'gif' }).webp({ quality: 82 }).toFile(path.join(webDir, `${base}.webp`));

    const line = markers[n];
    records.push({
      marker: n + 1,
      line: line ?? null,
      file: `${base}.${ext}`,
      web: `/images/chronicles/${ID}/${base}.webp`,
      textBefore: line == null ? [] : lines.slice(Math.max(0, line - 3), line).map((s) => s.trim()).filter(Boolean),
      verified: false,
      depicts: null,
      alignmentVerdict: null,
    });
    console.log(`  image ${n + 1}/${urls.length} → ${base}.${ext}`);
  }

  fs.writeFileSync(path.join(dir, 'alignment.json'), JSON.stringify({
    $comment: `UNVERIFIED image records for ${ID}. Ordinal alignment between the URL list and the "Image" markers in the transcript is an ASSUMPTION. Open every image, fill in depicts, and set verified before anything cites one. Entries with excluded set must not be published.`,
    images: records,
  }, null, 1) + '\n');
  console.log(`  ${records.length} image(s), ${markers.length} marker(s) in the transcript — alignment.json written unverified`);
}
