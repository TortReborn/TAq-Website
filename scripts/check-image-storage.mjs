#!/usr/bin/env node
/**
 * End-to-end check of the wiki image pipeline against whatever storage is
 * actually configured.
 *
 *   node scripts/check-image-storage.mjs
 *
 * Compresses a generated image, writes it, reads it back, compares bytes, then
 * deletes it. Run after changing BLOB_READ_WRITE_TOKEN or WIKI_BLOB_ACCESS —
 * an access-mode mismatch fails here in a second, rather than as a confusing
 * "access denied" the first time a contributor tries to upload a screenshot.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const sharp = require('sharp');

// Load .env the same way the seeder does, without clobbering a real environment.
const unquote = (v) => v.replace(/^(['"])(.*)\1$/s, '$2');

for (const name of ['.env', '.env.local']) {
  const p = path.join(__dirname, '..', name);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    // vercel env pull quotes its values; those quotes are not part of the value.
    if (!process.env[k]) process.env[k] = unquote(t.slice(i + 1).trim());
  }
}

const hasToken = !!process.env.BLOB_READ_WRITE_TOKEN;
const mode = process.env.WIKI_BLOB_ACCESS ?? 'public';
console.log(`token:  ${hasToken ? 'present' : 'absent'}`);
console.log(`mode:   WIKI_BLOB_ACCESS=${mode}`);
console.log(`backend expected: ${hasToken ? (mode === 'private' ? 'blob-private' : 'blob') : 's3'}\n`);

const { compressWikiImage, formatBytes } = await import('../lib/wiki-image-compress.ts');
const { putWikiImage, getWikiImage, activeImageBackend } = await import('../lib/wiki-image-storage.ts');

const backend = activeImageBackend();
console.log(`backend selected: ${backend}`);
if (backend !== (hasToken ? (mode === 'private' ? 'blob-private' : 'blob') : 's3')) {
  console.error('MISMATCH — the code chose a different backend than the env implies');
  process.exit(1);
}

// A recognisable test image rather than noise, so a stray object left behind in
// the store is obviously a test artefact.
const svg = Buffer.from(
  `<svg width="900" height="600" xmlns="http://www.w3.org/2000/svg">
     <rect width="900" height="600" fill="#0b3d5c"/>
     <text x="40" y="300" font-family="sans-serif" font-size="54" fill="#7fd1ff">
       chronicle storage check
     </text>
   </svg>`,
);
const source = await sharp(svg).jpeg({ quality: 95 }).toBuffer();

const compressed = await compressWikiImage(sharp, source, 'image/jpeg');
console.log(
  `compress: ${formatBytes(source.length)} -> ${formatBytes(compressed.data.length)} ` +
  `(${compressed.width}x${compressed.height}, q=${compressed.quality}, ${compressed.mime})`,
);

const key = `wiki_images/_storage-check-${Date.now()}.webp`;
let stored;
try {
  stored = await putWikiImage(key, compressed.data, compressed.mime);
} catch (err) {
  console.error(`\nWRITE FAILED: ${err.message}`);
  if (/access denied|forbidden/i.test(err.message)) {
    console.error(
      `\nThat is an access-mode mismatch. WIKI_BLOB_ACCESS is "${mode}"; ` +
      `set it to the other value and try again.`,
    );
  }
  process.exit(1);
}
console.log(`write:    ok -> ${stored.backend}`);
console.log(`location: ${stored.location.slice(0, 100)}${stored.location.length > 100 ? '…' : ''}`);

const readBack = await getWikiImage(stored);
if (!readBack) {
  console.error('READ FAILED: nothing came back');
  process.exit(1);
}
const identical = Buffer.compare(readBack, compressed.data) === 0;
console.log(`read:     ok, ${formatBytes(readBack.length)}, bytes ${identical ? 'match' : 'DIFFER'}`);
if (!identical) process.exit(1);

// Is the object reachable without credentials? That decides whether the serving
// route may redirect to it or has to proxy the bytes.
if (stored.backend === 'blob' || stored.backend === 'blob-private') {
  const anon = await fetch(stored.location).catch(() => null);
  const reachable = !!anon && anon.ok;
  console.log(`anonymous fetch: ${anon ? anon.status : 'network error'} — ${reachable ? 'public (CDN redirect works)' : 'not public (bytes must be proxied)'}`);
  const expectPublic = stored.backend === 'blob';
  if (reachable !== expectPublic) {
    console.error(
      `\nMISMATCH — backend "${stored.backend}" expects ` +
      `${expectPublic ? 'a publicly reachable object' : 'an object requiring auth'}, got the opposite.`,
    );
    console.error(`Set WIKI_BLOB_ACCESS=${reachable ? 'public' : 'private'} to match the store.`);
    process.exit(1);
  }
}

// Clean up so repeated runs do not accumulate objects against the quota.
try {
  if (stored.backend.startsWith('blob')) {
    const { del } = await import('@vercel/blob');
    await del(stored.location);
  } else {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const { getS3 } = await import('../lib/s3.ts');
    const { client, bucket } = getS3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: stored.location }));
  }
  console.log('cleanup:  test object deleted');
} catch (err) {
  console.warn(`cleanup:  could not delete (${err.message}) — remove ${key} by hand`);
}

console.log('\nStorage pipeline OK.');
