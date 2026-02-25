/**
 * Import the deduplicated 2018-2021 Discord war-log CSV into territory_exchanges,
 * then fetch any missing guild prefixes from the Wynncraft API.
 *
 * Usage:
 *   node scripts/import-discord-wars.js [path-to-deduped-csv]
 *
 * Defaults to the deduped file produced by dedup-war-log.js.
 * Uses DB_* env vars from .env (or TEST_DB_* if TEST_MODE=true).
 */

import fs from 'fs';
import readline from 'readline';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// .env loader
// ---------------------------------------------------------------------------
function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, '..', name);
    if (!fs.existsSync(envPath)) continue;
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
}

// ---------------------------------------------------------------------------
// CSV parser (handles double-quoted fields)
// ---------------------------------------------------------------------------
function parseCSVLine(line) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
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
// Parse Content field: "Territory: ~~Defender~~ -> **Attacker**"
// ---------------------------------------------------------------------------
const CONTENT_RE = /^(.+): ~~(.+)~~ -> \*\*(.+)\*\*$/;

function parseContent(content) {
  const m = CONTENT_RE.exec(content);
  if (!m) return null;
  return { territory: m[1], defender: m[2], attacker: m[3] };
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

  // ---- Ensure tables exist ----
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_territory_exchanges.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_guild_prefixes.sql'), 'utf8'));

  // ---- Count existing rows for reference ----
  const beforeRes = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  console.log(`Existing rows in territory_exchanges: ${beforeRes.rows[0].c.toLocaleString()}`);

  // ---- Phase 1: Stream CSV → batch insert ----
  const csvPath = process.argv[2]
    || String.raw`C:\Users\Aiden\OneDrive\Current\Downloads\War Log - 🌟Wynncraft - old-war-log [398199212581322752]\2018-2021-wars-deduped.csv`;

  console.log(`\nPhase 1: Importing CSV from ${csvPath}`);

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  const BATCH_SIZE = 2000;
  let batch = { times: [], terrs: [], attackers: [], defenders: [] };
  let rowCount = 0;
  let batchCount = 0;
  let parseErrors = 0;
  const guildNames = new Set();
  let isHeader = true;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    const parts = parseCSVLine(line);
    if (parts.length < 4) {
      parseErrors++;
      continue;
    }

    const [/* authorId */, /* author */, dateStr, content] = parts;

    // Parse the "Territory: ~~Defender~~ -> **Attacker**" content
    const parsed = parseContent(content);
    if (!parsed) {
      parseErrors++;
      continue;
    }

    // Convert the ISO date string to a proper timestamp
    // The dates look like "2020-06-22T16:21:08.2360000-07:00"
    const timestamp = new Date(dateStr).toISOString();
    if (timestamp === 'Invalid Date') {
      console.warn(`  [skip] Bad date on row ${rowCount + 2}: ${dateStr}`);
      parseErrors++;
      continue;
    }

    guildNames.add(parsed.attacker);
    guildNames.add(parsed.defender);

    batch.times.push(timestamp);
    batch.terrs.push(parsed.territory);
    batch.attackers.push(parsed.attacker);
    batch.defenders.push(parsed.defender);
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

  // Flush remainder
  if (batch.times.length > 0) {
    await pool.query(
      `INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)
       SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[])`,
      [batch.times, batch.terrs, batch.attackers, batch.defenders]
    );
    batchCount++;
  }

  console.log(`\n  CSV import done: ${rowCount.toLocaleString()} rows inserted (${batchCount} batches).`);
  if (parseErrors > 0) console.log(`  Parse errors skipped: ${parseErrors}`);
  console.log(`  ${guildNames.size} unique guild names found in this dataset.`);

  // ---- Phase 2: Fetch missing guild prefixes ----
  console.log('\nPhase 2: Fetching missing guild prefixes from Wynncraft API...');

  const existing = await pool.query('SELECT guild_name FROM guild_prefixes');
  const existingSet = new Set(existing.rows.map(r => r.guild_name));
  const toFetch = [...guildNames].filter(g => !existingSet.has(g));
  console.log(`  ${existingSet.size} prefixes already stored, ${toFetch.length} new guilds to fetch.`);

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
    if (done % 50 === 0) {
      console.log(`  ${done}/${toFetch.length}  (${fetched} API ok, ${fallback} fallback)`);
    }
  }

  console.log(`  Prefix fetch done: ${fetched} from API, ${fallback} fallback.`);

  // ---- Summary ----
  const afterExch = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  const afterPref = await pool.query('SELECT COUNT(*)::int AS c FROM guild_prefixes');
  console.log(`\nFinal state:`);
  console.log(`  territory_exchanges : ${afterExch.rows[0].c.toLocaleString()} rows`);
  console.log(`  guild_prefixes      : ${afterPref.rows[0].c.toLocaleString()} rows`);

  await pool.end();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
