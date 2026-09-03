// Seed Chronicles wiki articles from data/wiki/seed-articles.json.
//
//   node scripts/seed-wiki-articles.mjs --dry-run     validate only
//   node scripts/seed-wiki-articles.mjs --dev         seed the TEST_DB_* database
//   node scripts/seed-wiki-articles.mjs --prod        seed the DB_* database
//
// Pages are validated with lib/wiki validateWikiPagePayload and written through
// lib/wiki-db (createWikiPage / editWikiPage), so every page lands with a
// proper revision, link recomputation and full-text indexing. Existing slugs
// are edited (a new revision), never duplicated — the script is idempotent.
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ts = require('typescript');
const pg = require('pg');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useProd = args.includes('--prod');
if (!dryRun && !useProd && !args.includes('--dev')) {
  console.error('Pass --dry-run, --dev (TEST_DB_*) or --prod (DB_*).');
  process.exit(2);
}

for (const name of ['.env', '.env.local']) {
  const envPath = path.join(__dirname, '..', name);
  if (!fs.existsSync(envPath)) continue;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(idx + 1).trim();
  }
}

// Transpile the TS wiki libs to CJS in a temp dir so this script shares their logic
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wiki-seed-'));
for (const [src, out] of [['lib/wiki.ts', 'x-wiki.cjs'], ['lib/wiki-db.ts', 'x-wiki-db.cjs']]) {
  const code = fs.readFileSync(path.join(__dirname, '..', src), 'utf8');
  let js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  js = js.replace(/require\("\.\/wiki"\)/g, `require(${JSON.stringify(path.join(tmp, 'x-wiki.cjs'))})`);
  js = js.replace(/require\("pg"\)/g, `require(${JSON.stringify(path.join(__dirname, '..', 'node_modules', 'pg'))})`);
  fs.writeFileSync(path.join(tmp, out), js);
}
const wiki = require(path.join(tmp, 'x-wiki.cjs'));
const wikiDb = require(path.join(tmp, 'x-wiki-db.cjs'));

const env = (name) => (useProd ? process.env[name] : process.env[`TEST_${name}`]);
const pool = dryRun ? null : new pg.Pool({
  host: env('DB_HOST'),
  port: parseInt(env('DB_PORT') || '5432'),
  user: env('DB_LOGIN'),
  password: env('DB_PASS'),
  database: env('DB_DATABASE'),
  ssl: { rejectUnauthorized: false },
  max: 1,
});

const AUTHOR = { id: '170719819715313665', name: 'Thundderr' };
const NOTE = 'Seeded from the chronicle research corpus';

const { articles } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'wiki', 'seed-articles.json'), 'utf8'));

let created = 0, updated = 0, failed = 0;
const seen = new Set();
for (const raw of articles) {
  const v = wiki.validateWikiPagePayload(raw);
  if (!v.ok) { failed++; console.error(`INVALID ${raw.slug ?? raw.title}: ${v.error}`); continue; }
  const p = v.value;
  if (seen.has(p.slug)) { failed++; console.error(`DUPLICATE slug: ${p.slug}`); continue; }
  seen.add(p.slug);
  if (dryRun) { console.log(`ok ${p.pageType.padEnd(8)} ${p.slug}`); continue; }
  const existing = await pool.query('SELECT id FROM wiki_pages WHERE slug = $1', [p.slug]);
  const r = existing.rows.length
    ? await wikiDb.editWikiPage(pool, existing.rows[0].id, p, AUTHOR, NOTE)
    : await wikiDb.createWikiPage(pool, p, AUTHOR, NOTE);
  if (!r.ok) { failed++; console.error(`FAILED ${p.slug}: ${r.error}`); continue; }
  if (existing.rows.length) { updated++; console.log(`updated ${p.slug}`); }
  else { created++; console.log(`created ${p.slug}`); }
}
// Redirects: "federation" (the chronicle alliance name) to its article, and
// founding/rename chronicle events to the alliance pages that cover them —
// the map/timeline cross-links resolve event titles via slugify, so these
// make every chronicle event land somewhere.
const REDIRECTS = [
  ['federation', 'the-federation'],
  ['the-federation-forms', 'the-federation'],
  ['luna-is-formed', 'luna'],
  ['council-of-canyon-kingdoms-formed', 'council-of-canyon-kingdoms'],
  ['vanir-is-formed', 'vanir'],
  ['cucumber-company-forms', 'cucumber-company'],
  // common apostrophe-less misspelling of fall-of-profession-heaven-s-neutrality
  ['fall-of-profession-heavens-neutrality', 'fall-of-profession-heaven-s-neutrality'],
];
if (!dryRun) {
  for (const [from, to] of REDIRECTS) {
    const target = await pool.query(`SELECT id FROM wiki_pages WHERE slug = $1`, [to]);
    if (!target.rows.length) { console.error(`redirect target missing: ${to}`); continue; }
    await pool.query(
      `INSERT INTO wiki_redirects (from_slug, to_page_id) VALUES ($1, $2) ON CONFLICT (from_slug) DO NOTHING`,
      [from, target.rows[0].id],
    );
    console.log(`redirect ensured: ${from} -> ${to}`);
  }
}

console.log(`\n${dryRun ? 'DRY RUN — ' : ''}created ${created}, updated ${updated}, failed ${failed}, total ${seen.size}`);
if (pool) await pool.end();
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
