#!/usr/bin/env node
/**
 * Designate a chronicler from the command line.
 *
 *   node scripts/add-chronicler.mjs --dev  <discordId> "Display Name" ["why"]
 *   node scripts/add-chronicler.mjs --prod <discordId> "Display Name" ["why"]
 *   node scripts/add-chronicler.mjs --prod --list
 *
 * The editorial page is the normal way to do this. This exists for the
 * first one, when there is no chronicler yet to add anybody.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const useTest = args.includes('--dev');
const list = args.includes('--list');
if (!useTest && !args.includes('--prod')) {
  console.error('usage: add-chronicler.mjs (--dev|--prod) <discordId> "Name" ["why"]  |  --list');
  process.exit(1);
}
const positional = args.filter((a) => !a.startsWith('--'));

const unquote = (v) => v.replace(/^(['"])(.*)\1$/s, '$2');
const envText = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
const envMap = Object.fromEntries(
  envText.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), unquote(l.slice(i + 1).trim())];
  }),
);
const env = (k) => (useTest ? envMap[`TEST_${k}`] ?? envMap[k] : envMap[k]);

const pool = new pg.Pool({
  host: env('DB_HOST'), port: Number(env('DB_PORT')), user: env('DB_LOGIN'),
  password: env('DB_PASS'), database: env('DB_DATABASE'),
  ssl: env('DB_SSLMODE') === 'disable' ? undefined : { rejectUnauthorized: false }, max: 1,
});

// Same shape ensureWikiTables creates, inlined so this runs without the TS libs.
await pool.query(`
  CREATE TABLE IF NOT EXISTS wiki_chroniclers (
    discord_id   VARCHAR(30)  PRIMARY KEY,
    display_name VARCHAR(60)  NOT NULL DEFAULT '',
    note         VARCHAR(200) NOT NULL DEFAULT '',
    active       BOOLEAN      NOT NULL DEFAULT TRUE,
    added_by     VARCHAR(60)  NOT NULL,
    added_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  );
`);

if (!list) {
  const [discordId, displayName = '', note = ''] = positional;
  if (!/^\d{15,25}$/.test(discordId ?? '')) {
    console.error('a numeric Discord user id is required');
    process.exit(1);
  }
  await pool.query(
    `INSERT INTO wiki_chroniclers (discord_id, display_name, note, added_by)
     VALUES ($1, $2, $3, 'bootstrap')
     ON CONFLICT (discord_id) DO UPDATE
       SET active = TRUE, display_name = EXCLUDED.display_name, note = EXCLUDED.note`,
    [discordId, displayName, note],
  );
  console.log(`${useTest ? 'DEV ' : 'PROD'}  added ${displayName || discordId}`);
}

const r = await pool.query(`SELECT discord_id, display_name, note, active FROM wiki_chroniclers ORDER BY added_at`);
console.log(`${useTest ? 'DEV ' : 'PROD'}  chroniclers now:`);
for (const c of r.rows) {
  console.log(`   ${c.active ? '✓' : '✗'} ${(c.display_name || '(no name)').padEnd(14)} ${c.discord_id}  ${c.note}`);
}
await pool.end();
