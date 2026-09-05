/**
 * Export daily territory-ownership snapshots for the first weeks of the
 * exchange log, so the pre-2018 reconstruction can be shown handing over to
 * real data at the point the log begins.
 *
 * Read-only. Writes one JSON file; touches nothing in the database.
 *
 * Usage:
 *   node scripts/_export-early-2018-snapshots.mjs <outFile> [fromISO] [toISO]
 */
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env loader — same pattern as the other scripts in this folder
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
    if (!process.env[k]) process.env[k] = unquote(t.slice(i + 1).trim());
  }
}

const out = process.argv[2];
const FROM = new Date(process.argv[3] || '2018-01-03T00:00:00Z');
const TO = new Date(process.argv[4] || '2018-02-05T00:00:00Z');
if (!out) { console.error('need an output path'); process.exit(2); }

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_LOGIN,
  password: process.env.DB_PASS,
  database: process.env.DB_DATABASE,
  ssl: process.env.DB_SSLMODE === 'disable' ? undefined : { rejectUnauthorized: false },
  max: 1,
});

// Every exchange in the window, plus the last exchange before it for each
// territory, which gives the holder at the moment the window opens.
const { rows: pre } = await pool.query(
  `SELECT DISTINCT ON (territory) territory,
          CASE WHEN attacker_name <> 'None' THEN attacker_name ELSE defender_name END AS guild
     FROM territory_exchanges
    WHERE exchange_time < $1
    ORDER BY territory, exchange_time DESC`, [FROM]);

const { rows: ev } = await pool.query(
  `SELECT territory, exchange_time,
          CASE WHEN attacker_name <> 'None' THEN attacker_name ELSE defender_name END AS guild,
          defender_name
     FROM territory_exchanges
    WHERE exchange_time >= $1 AND exchange_time < $2
    ORDER BY exchange_time ASC`, [FROM, TO]);

// Seed from the first exchange's defender where a territory has no earlier row.
const held = new Map(pre.map((r) => [r.territory, r.guild]));
for (const r of ev) {
  if (!held.has(r.territory) && r.defender_name && r.defender_name !== 'None') held.set(r.territory, r.defender_name);
}

// Six-hour buckets, so the log's own movement is visible rather than a daily
// step. The timestamps are real; nothing here is interpolated.
const STEP = 6 * 3600 * 1000;
const days = [];
let k = 0;
const cur = new Map(held);
for (let t = FROM.getTime(); t < TO.getTime(); t += STEP) {
  const end = t + STEP;
  while (k < ev.length && new Date(ev[k].exchange_time).getTime() < end) {
    if (ev[k].guild && ev[k].guild !== 'None') cur.set(ev[k].territory, ev[k].guild);
    k++;
  }
  days.push({ date: new Date(t).toISOString().slice(0, 16).replace('T', ' '), own: Object.fromEntries(cur) });
}

// Guild colours, merged the way /api/guild-colors/cached merges them:
// generated fallbacks as the base layer, API-sourced colours on top.
const colors = {};
try {
  const gen = await pool.query('SELECT guild_name, color FROM guild_generated_colors');
  for (const r of gen.rows) if (r.color) colors[r.guild_name] = r.color;
} catch { /* table may not exist */ }
try {
  const cache = await pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'guildColors'`);
  const arr = cache.rows[0]?.data;
  if (Array.isArray(arr)) {
    for (const g of arr) {
      if (!g?.color) continue;
      if (g._id) colors[g._id] = g.color;
      if (g.prefix) colors[g.prefix] = g.color;
      if (g.name) colors[g.name] = g.color;
    }
  }
} catch { /* cache row may be absent */ }

fs.writeFileSync(out, JSON.stringify({
  from: FROM.toISOString(), to: TO.toISOString(),
  exchanges: ev.length, territories: cur.size, days, colors,
}));
console.log(`guild colours exported: ${Object.keys(colors).length}`);

console.log(`exchanges in window: ${ev.length}`);
console.log(`territories seen: ${cur.size}`);
console.log(`daily snapshots: ${days.length}  (${days[0].date} .. ${days[days.length - 1].date})`);
const last = days[days.length - 1];
const tally = {};
for (const g of Object.values(last.own)) tally[g] = (tally[g] || 0) + 1;
console.log('holders on ' + last.date + ': ' +
  Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g, n]) => `${g} ${n}`).join(', '));
await pool.end();
