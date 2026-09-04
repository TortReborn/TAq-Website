#!/usr/bin/env node
/**
 * Relabel historical seeded revisions as AI-authored.
 *
 *   node scripts/backfill-ai-authorship.mjs --dev [--dry-run]
 *   node scripts/backfill-ai-authorship.mjs --prod
 *
 * Every page in the wiki was written by the drafting pipeline and recorded
 * under a guild member's Discord id, because the seeder had no way to say
 * otherwise. That attribution is wrong in a way that matters: it makes 180
 * machine-written pages look like they were typed and checked by a person, and
 * the unverified banner is computed from exactly this column.
 *
 * A revision is treated as AI-written when it carries the seeder's note. Any
 * revision a person actually made through the editor has a different note, so
 * this cannot silently relabel real human work — and the script reports the
 * split before writing anything.
 */
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const useTest = args.includes('--dev');
/**
 * Relabel every revision, not just the seeder's. For clearing out development
 * test rows — an editor smoke test writes a genuine 'human' revision, which
 * then permanently marks its page verified even though nobody checked it.
 * Never run this against a database with real contributor edits in it.
 */
const all = args.includes('--all');
if (!useTest && !args.includes('--prod')) {
  console.error('usage: backfill-ai-authorship.mjs (--dev | --prod) [--dry-run] [--all]');
  process.exit(1);
}

// .env is read directly: this is a one-shot maintenance script, not app code.
const unquote = (v) => v.replace(/^(['"])(.*)\1$/s, '$2');

const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const envMap = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      // vercel env pull quotes its values; those quotes are not part of the value.
      return [l.slice(0, i).trim(), unquote(l.slice(i + 1).trim())];
    }),
);
const env = (k) => (useTest ? envMap[`TEST_${k}`] ?? envMap[k] : envMap[k]);

const SEED_NOTE = 'Seeded from the chronicle research corpus';

const pool = new pg.Pool({
  host: env('DB_HOST'),
  port: Number(env('DB_PORT')),
  user: env('DB_LOGIN'),
  password: env('DB_PASS'),
  database: env('DB_DATABASE'),
  ssl: env('DB_SSLMODE') === 'disable' ? undefined : { rejectUnauthorized: false },
  max: 1,
});

// The app creates the wiki schema lazily on first request, so a database that
// has not served a page since this column was added will not have it yet. This
// is the same idempotent ALTER ensureWikiTables runs, inlined so the script
// does not need the TS libs transpiled.
await pool.query(
  `ALTER TABLE wiki_page_revisions ADD COLUMN IF NOT EXISTS author_kind VARCHAR(8) NOT NULL DEFAULT 'human'`,
);

const before = await pool.query(
  `SELECT author_kind, COUNT(*) AS n FROM wiki_page_revisions GROUP BY 1 ORDER BY 1`,
);
console.log('before:');
for (const r of before.rows) console.log(`  ${r.author_kind}: ${r.n}`);

const target = await pool.query(
  all
    ? `SELECT COUNT(*) AS n FROM wiki_page_revisions WHERE author_kind <> 'ai'`
    : `SELECT COUNT(*) AS n FROM wiki_page_revisions WHERE note = $1 AND author_kind <> 'ai'`,
  all ? [] : [SEED_NOTE],
);

// With --all there is nothing left over to reassure anyone about, so show what
// is about to be relabelled instead. These are the rows a person would have to
// look at to decide the flag is safe.
if (all) {
  const rows = await pool.query(
    `SELECT w.slug, r.rev_number, r.author_name, r.note
       FROM wiki_page_revisions r JOIN wiki_pages w ON w.id = r.page_id
      WHERE r.author_kind <> 'ai' ORDER BY w.slug, r.rev_number`,
  );
  console.log('\nrevisions --all will relabel:');
  for (const r of rows.rows) {
    console.log(`  ${r.slug} rev${r.rev_number} — ${r.author_name}: "${r.note}"`);
  }
}
console.log(`\nrevisions to relabel as ai: ${target.rows[0].n}`);
if (!all) {
  const other = await pool.query(
    `SELECT note, COUNT(*) AS n FROM wiki_page_revisions WHERE note <> $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 10`,
    [SEED_NOTE],
  );
  console.log('notes NOT being touched (these stay human):');
  for (const r of other.rows) console.log(`  ${String(r.n).padStart(4)}  ${r.note.slice(0, 80)}`);
}

if (dryRun) {
  console.log('\nDRY RUN — nothing written');
  await pool.end();
  process.exit(0);
}

// The note is left alone deliberately: it records what the revision actually
// was, and rewriting it to look like a drafting pass would falsify history to
// make the numbers tidy.
await pool.query(
  all
    ? `UPDATE wiki_page_revisions
          SET author_kind = 'ai', author_id = 'chronicle-ai', author_name = 'Chronicle drafting pass'`
    : `UPDATE wiki_page_revisions
          SET author_kind = 'ai', author_id = 'chronicle-ai', author_name = 'Chronicle drafting pass'
        WHERE note = $1`,
  all ? [] : [SEED_NOTE],
);

const after = await pool.query(
  `SELECT author_kind, COUNT(*) AS n FROM wiki_page_revisions GROUP BY 1 ORDER BY 1`,
);
console.log('\nafter:');
for (const r of after.rows) console.log(`  ${r.author_kind}: ${r.n}`);

const unverified = await pool.query(
  `SELECT COUNT(*) AS n FROM wiki_pages p
    WHERE p.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM wiki_page_revisions r WHERE r.page_id = p.id AND r.author_kind = 'human')`,
);
console.log(`\npages now showing the unverified banner: ${unverified.rows[0].n}`);

await pool.end();
