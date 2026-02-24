/**
 * Import territory exchange CSV data into the territory_exchanges table.
 *
 * Usage:
 *   node scripts/import-exchanges.js [path-to-csv]
 *
 * Defaults to C:\Users\Aiden\OneDrive\Current\Downloads\terr_exchange.csv
 * Uses DB_* env vars from .env (or TEST_DB_* if TEST_MODE=true).
 *
 * Two phases:
 *   1. Stream CSV and batch-insert into territory_exchanges
 *   2. Fetch guild prefixes from Wynncraft API into guild_prefixes
 */

import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// .env loader (no dotenv dependency needed)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// CSV line parser (handles double-quoted fields)
// ---------------------------------------------------------------------------
function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';       // escaped quote
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Load known territory names from territory-abbreviations.ts (for logging)
// ---------------------------------------------------------------------------
function loadKnownTerritories() {
  const tsPath = path.join(__dirname, '..', 'lib', 'territory-abbreviations.ts');
  const content = fs.readFileSync(tsPath, 'utf8');
  const known = new Set();
  const regex = /"([^"]+)":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    // Territory names are values before abbreviations (abbreviations are short)
    if (match[2].length <= 5) known.add(match[1]);
  }
  return known;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const isTest = (process.env.TEST_MODE || '').toLowerCase() === 'true';
  const pick = (prod, test) => isTest ? process.env[test] : process.env[prod];

  const dbConfig = {
    user:     pick('DB_LOGIN', 'TEST_DB_LOGIN'),
    password: pick('DB_PASS', 'TEST_DB_PASS') || undefined,
    host:     pick('DB_HOST', 'TEST_DB_HOST'),
    port:     parseInt(pick('DB_PORT', 'TEST_DB_PORT')) || 5432,
    database: pick('DB_DATABASE', 'TEST_DB_DATABASE'),
    ssl:      (pick('DB_SSLMODE', 'TEST_DB_SSLMODE') || '').toLowerCase() === 'require'
                ? { rejectUnauthorized: false } : undefined,
  };

  console.log(`Connecting to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} ...`);
  const pool = new pg.Pool({ ...dbConfig, max: 3 });

  // ---- Create tables ----
  console.log('Creating tables if not exist...');
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_territory_exchanges.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_guild_prefixes.sql'), 'utf8'));

  // ---- Load known territory names for validation ----
  const knownTerritories = loadKnownTerritories();
  console.log(`Loaded ${knownTerritories.size} known territory names from abbreviations file.`);

  // ---- Phase 1: Stream CSV → batch insert ----
  const csvPath = process.argv[2]
    || String.raw`C:\Users\Aiden\OneDrive\Current\Downloads\terr_exchange.csv`;
  console.log(`\nPhase 1: Importing CSV from ${csvPath}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  const BATCH_SIZE = 2000;
  let batch = { times: [], terrs: [], attackers: [], defenders: [] };
  let rowCount = 0;
  let batchCount = 0;
  const unknownTerritories = new Set();
  const guildNames = new Set();
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    const parts = parseCSVLine(line);
    if (parts.length !== 4) {
      console.warn(`  [skip] Malformed line ${rowCount + 2}: ${line.substring(0, 80)}`);
      continue;
    }

    const [timeStr, defender, attacker, territory] = parts;
    const unixSec = parseInt(timeStr);
    if (isNaN(unixSec)) {
      console.warn(`  [skip] Bad timestamp on line ${rowCount + 2}: ${timeStr}`);
      continue;
    }

    const timestamp = new Date(unixSec * 1000).toISOString();

    if (!knownTerritories.has(territory)) unknownTerritories.add(territory);
    if (attacker !== 'None') guildNames.add(attacker);
    if (defender !== 'None') guildNames.add(defender);

    batch.times.push(timestamp);
    batch.terrs.push(territory);
    batch.attackers.push(attacker);
    batch.defenders.push(defender);
    rowCount++;

    if (batch.times.length >= BATCH_SIZE) {
      await pool.query(
        `INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)
         SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[])`,
        [batch.times, batch.terrs, batch.attackers, batch.defenders]
      );
      batchCount++;
      batch = { times: [], terrs: [], attackers: [], defenders: [] };
      if (batchCount % 50 === 0) {
        console.log(`  ${rowCount.toLocaleString()} rows (${batchCount} batches)...`);
      }
    }
  }

  // flush remainder
  if (batch.times.length > 0) {
    await pool.query(
      `INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)
       SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[])`,
      [batch.times, batch.terrs, batch.attackers, batch.defenders]
    );
    batchCount++;
  }

  console.log(`\n  CSV done: ${rowCount.toLocaleString()} rows, ${batchCount} batches.`);
  console.log(`  ${unknownTerritories.size} territory names not in current mapping:`);
  for (const t of [...unknownTerritories].sort()) console.log(`    - ${t}`);
  console.log(`  ${guildNames.size} unique guild names found.`);

  // ---- Phase 2: Fetch guild prefixes ----
  console.log('\nPhase 2: Fetching guild prefixes from Wynncraft API...');

  const existing = await pool.query('SELECT guild_name FROM guild_prefixes');
  const existingSet = new Set(existing.rows.map(r => r.guild_name));
  const toFetch = [...guildNames].filter(g => !existingSet.has(g));
  console.log(`  ${existingSet.size} already stored, ${toFetch.length} to fetch.`);

  let fetched = 0;
  let fallback = 0;

  for (const name of toFetch) {
    let prefix;
    try {
      const resp = await fetch(
        `https://api.wynncraft.com/v3/guild/${encodeURIComponent(name)}`
      );
      if (resp.ok) {
        const data = await resp.json();
        prefix = data.prefix || name.substring(0, 3).toUpperCase();
        fetched++;
      } else {
        prefix = name.substring(0, 3).toUpperCase();
        fallback++;
      }
    } catch {
      prefix = name.substring(0, 3).toUpperCase();
      fallback++;
    }

    await pool.query(
      `INSERT INTO guild_prefixes (guild_name, guild_prefix)
       VALUES ($1, $2) ON CONFLICT (guild_name) DO NOTHING`,
      [name, prefix]
    );

    // ~2 req/s rate limit
    await new Promise(r => setTimeout(r, 500));

    const done = fetched + fallback;
    if (done % 100 === 0) {
      console.log(`  ${done}/${toFetch.length}  (${fetched} API, ${fallback} fallback)`);
    }
  }

  console.log(`  Prefix fetch done: ${fetched} from API, ${fallback} fallback.`);

  // ---- Summary ----
  const exCount = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  const pfCount = await pool.query('SELECT COUNT(*)::int AS c FROM guild_prefixes');
  console.log(`\nFinal state:`);
  console.log(`  territory_exchanges : ${exCount.rows[0].c.toLocaleString()} rows`);
  console.log(`  guild_prefixes      : ${pfCount.rows[0].c.toLocaleString()} rows`);

  await pool.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
