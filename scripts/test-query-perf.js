import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, '..', name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const idx = t.indexOf('=');
      if (idx === -1) continue;
      if (!process.env[t.slice(0, idx).trim()])
        process.env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim();
    }
  }
}

loadEnv();

const pool = new pg.Pool({
  user: process.env.DB_LOGIN,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

console.log('Testing exchange query performance...\n');

let t = Date.now();
const r1 = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
console.log(`Total rows: ${r1.rows[0].c.toLocaleString()} (${Date.now() - t}ms)`);

t = Date.now();
const r2 = await pool.query(`
  SELECT COUNT(*)::int AS c FROM (
    SELECT DISTINCT ON (exchange_time, territory, attacker_name)
           exchange_time
    FROM territory_exchanges
    ORDER BY exchange_time ASC, territory, attacker_name
  ) sub
`);
console.log(`Distinct rows: ${r2.rows[0].c.toLocaleString()} (${Date.now() - t}ms)`);

// Simulate what the exchanges endpoint does — fetch all rows and process
console.log('\nFetching ALL rows (simulating /api/map-history/exchanges)...');
t = Date.now();
const result = await pool.query(`
  SELECT DISTINCT ON (exchange_time, territory, attacker_name)
         exchange_time, territory, attacker_name
  FROM territory_exchanges
  ORDER BY exchange_time ASC, territory, attacker_name
`);
const queryMs = Date.now() - t;
console.log(`Query returned ${result.rows.length.toLocaleString()} rows in ${queryMs}ms`);

// Process like the route does
t = Date.now();
const territoryIndex = new Map();
const territories = [];
const guildIndex = new Map();
const guilds = [];
const events = [];
let buffer = [];

function flushBuffer() {
  if (buffer.length === 0) return;
  const hasNonNone = buffer.some(r => r.attacker_name !== 'None');
  for (const r of buffer) {
    if (hasNonNone && r.attacker_name === 'None') continue;
    const sec = Math.floor(r.exchange_time.getTime() / 1000);
    let tIdx = territoryIndex.get(r.territory);
    if (tIdx === undefined) { tIdx = territories.length; territoryIndex.set(r.territory, tIdx); territories.push(r.territory); }
    let gIdx = guildIndex.get(r.attacker_name);
    if (gIdx === undefined) { gIdx = guilds.length; guildIndex.set(r.attacker_name, gIdx); guilds.push(r.attacker_name); }
    events.push([sec, tIdx, gIdx]);
  }
  buffer = [];
}

for (const row of result.rows) {
  const sec = Math.floor(row.exchange_time.getTime() / 1000);
  const bufSec = buffer.length > 0 ? Math.floor(buffer[0].exchange_time.getTime() / 1000) : -1;
  if (buffer.length > 0 && (sec !== bufSec || row.territory !== buffer[0].territory)) flushBuffer();
  buffer.push(row);
}
flushBuffer();
const processMs = Date.now() - t;
console.log(`Processing: ${processMs}ms`);
console.log(`Events after None-filtering: ${events.length.toLocaleString()}`);
console.log(`Unique territories: ${territories.length}`);
console.log(`Unique guilds: ${guilds.length}`);

// Estimate JSON size
t = Date.now();
const json = JSON.stringify({ territories, guilds, prefixes: guilds.map(g => g.substring(0, 3).toUpperCase()), events });
const jsonMs = Date.now() - t;
console.log(`\nJSON serialization: ${jsonMs}ms`);
console.log(`JSON size: ${(json.length / 1024 / 1024).toFixed(1)} MB`);
console.log(`Total time: ${queryMs + processMs + jsonMs}ms`);

await pool.end();
