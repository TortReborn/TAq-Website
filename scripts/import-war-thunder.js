/**
 * Import territory exchange data from War_for_thundderr.csv into territory_exchanges.
 *
 * This CSV uses guild UUIDs instead of names, so we resolve them via the Wynncraft API.
 *
 * CSV columns: territory, oldGuild (UUID), newGuild (UUID), end (ISO timestamp)
 * DB columns:  exchange_time, territory, attacker_name, defender_name
 *
 * Steps:
 *   1. Scan CSV to collect unique guild UUIDs
 *   2. Resolve UUIDs → guild names via Wynncraft API (cached to uuid-cache.json)
 *   3. Stream CSV, clean, deduplicate, and batch-insert
 *   4. Upsert guild prefixes
 *
 * Usage:
 *   node scripts/import-war-thunder.js [path-to-csv]
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
// CSV line parser
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
// Load known territory names
// ---------------------------------------------------------------------------
function loadKnownTerritories() {
  const tsPath = path.join(__dirname, '..', 'lib', 'territory-abbreviations.ts');
  const content = fs.readFileSync(tsPath, 'utf8');
  const known = new Set();
  const regex = /"([^"]+)":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[2].length <= 5) known.add(match[1]);
  }
  return known;
}

// ---------------------------------------------------------------------------
// UUID → guild name resolution with caching
// ---------------------------------------------------------------------------
async function resolveGuildUUIDs(uuids) {
  const cachePath = path.join(__dirname, 'uuid-cache.json');
  let cache = {};
  if (fs.existsSync(cachePath)) {
    cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    console.log(`  Loaded ${Object.keys(cache).length} cached UUID mappings.`);
  }

  const toFetch = uuids.filter(u => !cache[u]);
  console.log(`  ${uuids.length} unique UUIDs, ${uuids.length - toFetch.length} cached, ${toFetch.length} to fetch.`);

  let fetched = 0;
  let failed = 0;
  let delay = 1000; // Start at 1 req/s

  for (const uuid of toFetch) {
    let success = false;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const resp = await fetch(
          `https://api.wynncraft.com/v3/guild/uuid/${encodeURIComponent(uuid)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          cache[uuid] = { name: data.name, prefix: data.prefix || data.name.substring(0, 3).toUpperCase() };
          fetched++;
          success = true;
          // Successful - gradually speed up (min 800ms)
          delay = Math.max(800, delay - 20);
          break;
        } else if (resp.status === 429) {
          // Rate limited - back off heavily
          const backoff = Math.min(30000, 2000 * Math.pow(2, attempt));
          console.warn(`  [429] Rate limited on ${uuid}, waiting ${(backoff / 1000).toFixed(0)}s (attempt ${attempt + 1}/4)`);
          delay = Math.min(3000, delay + 500); // Slow down base rate too
          await new Promise(r => setTimeout(r, backoff));
          continue;
        } else if (resp.status === 500) {
          // Server error - guild likely deleted, don't retry
          console.warn(`  [500] Server error for ${uuid} (guild likely deleted)`);
          cache[uuid] = { name: null, prefix: null };
          failed++;
          success = true; // Don't retry
          break;
        } else {
          console.warn(`  [${resp.status}] Unexpected for ${uuid}`);
          cache[uuid] = { name: null, prefix: null };
          failed++;
          success = true;
          break;
        }
      } catch (err) {
        const backoff = Math.min(15000, 2000 * Math.pow(2, attempt));
        console.warn(`  [err] ${err.message} for ${uuid}, waiting ${(backoff / 1000).toFixed(0)}s (attempt ${attempt + 1}/4)`);
        await new Promise(r => setTimeout(r, backoff));
        continue;
      }
    }

    if (!success) {
      console.warn(`  [fail] Gave up on ${uuid} after 4 attempts`);
      cache[uuid] = { name: null, prefix: null };
      failed++;
    }

    await new Promise(r => setTimeout(r, delay));

    const done = fetched + failed;
    if (done % 25 === 0) {
      console.log(`  ${done}/${toFetch.length} resolved (${fetched} ok, ${failed} failed, delay=${delay}ms)`);
      fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
    }
  }

  // Final cache save
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  console.log(`  Resolution done: ${fetched} from API, ${failed} failed.`);

  return cache;
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

  const csvPath = process.argv[2]
    || String.raw`C:\Users\Aiden\OneDrive\Current\Downloads\War_for_thundderr\War_for_thundderr.csv`;

  // ---- Step 1: Scan for unique UUIDs ----
  console.log(`\nStep 1: Scanning CSV for unique guild UUIDs...`);
  console.log(`  File: ${csvPath}`);

  const uuidSet = new Set();
  const rl1 = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  let scanCount = 0;
  for await (const line of rl1) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length !== 4) continue;
    const oldGuild = parts[1].trim();
    const newGuild = parts[2].trim();
    if (oldGuild) uuidSet.add(oldGuild);
    if (newGuild) uuidSet.add(newGuild);
    scanCount++;
  }
  console.log(`  Scanned ${scanCount.toLocaleString()} rows, found ${uuidSet.size} unique guild UUIDs.`);

  // ---- Step 2: Resolve UUIDs ----
  console.log(`\nStep 2: Resolving guild UUIDs via Wynncraft API...`);
  const uuidMap = await resolveGuildUUIDs([...uuidSet]);

  const resolvedCount = Object.values(uuidMap).filter(v => v.name).length;
  const unresolvedCount = Object.values(uuidMap).filter(v => !v.name).length;
  console.log(`  ${resolvedCount} resolved, ${unresolvedCount} unresolved.`);

  if (unresolvedCount > 0) {
    console.log(`  Unresolved UUIDs (will be mapped to "None"):`);
    for (const [uuid, val] of Object.entries(uuidMap)) {
      if (!val.name) console.log(`    ${uuid}`);
    }
  }

  // ---- Step 3: Stream CSV, clean, deduplicate, insert ----
  console.log(`\nStep 3: Importing cleaned data into database...`);
  console.log(`  Connecting to ${dbConfig.host}:${dbConfig.port}/${dbConfig.database} ...`);
  const pool = new pg.Pool({ ...dbConfig, max: 3 });

  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_territory_exchanges.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_guild_prefixes.sql'), 'utf8'));

  const knownTerritories = loadKnownTerritories();
  console.log(`  Loaded ${knownTerritories.size} known territory names.`);

  const rl2 = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  const BATCH_SIZE = 2000;
  let batch = { times: [], terrs: [], attackers: [], defenders: [] };
  let rowCount = 0;
  let batchCount = 0;
  let skippedDupe = 0;
  let skippedSameGuild = 0;
  let skippedMissingTerritory = 0;
  const unknownTerritories = new Set();
  const guildNames = new Set();
  const seen = new Set();
  isHeader = true;

  for await (const line of rl2) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    const parts = parseCSVLine(line);
    if (parts.length !== 4) continue;

    const [territory, oldGuildUUID, newGuildUUID, endStr] = parts.map(s => s.trim());

    if (!territory || !endStr) {
      continue;
    }

    // Resolve guild UUIDs to names
    const defenderName = oldGuildUUID
      ? (uuidMap[oldGuildUUID]?.name || 'None')
      : 'None';
    const attackerName = newGuildUUID
      ? (uuidMap[newGuildUUID]?.name || 'None')
      : 'None';

    // Skip rows where attacker == defender (no actual change)
    if (attackerName === defenderName && attackerName !== 'None') {
      skippedSameGuild++;
      continue;
    }

    // Deduplicate
    const key = `${endStr}|${territory}|${attackerName}|${defenderName}`;
    if (seen.has(key)) {
      skippedDupe++;
      continue;
    }
    seen.add(key);

    // Validate timestamp
    const timestamp = endStr.endsWith('Z') ? endStr : endStr + 'Z';

    // Track unknown territories
    if (!knownTerritories.has(territory)) unknownTerritories.add(territory);

    // Track guild names for prefix fetching
    if (attackerName !== 'None') guildNames.add(attackerName);
    if (defenderName !== 'None') guildNames.add(defenderName);

    batch.times.push(timestamp);
    batch.terrs.push(territory);
    batch.attackers.push(attackerName);
    batch.defenders.push(defenderName);
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

  console.log(`\n  Import done:`);
  console.log(`    Inserted:            ${rowCount.toLocaleString()} rows`);
  console.log(`    Skipped (duplicate): ${skippedDupe.toLocaleString()}`);
  console.log(`    Skipped (same guild):${skippedSameGuild.toLocaleString()}`);
  console.log(`    Unknown territories: ${unknownTerritories.size}`);
  if (unknownTerritories.size > 0) {
    for (const t of [...unknownTerritories].sort()) console.log(`      - ${t}`);
  }
  console.log(`    Unique guild names:  ${guildNames.size}`);

  // ---- Step 4: Fetch guild prefixes ----
  console.log('\nStep 4: Updating guild prefixes...');

  // Insert prefixes from UUID cache first (already have them)
  let prefixInserted = 0;
  for (const [uuid, val] of Object.entries(uuidMap)) {
    if (val.name && val.prefix) {
      await pool.query(
        `INSERT INTO guild_prefixes (guild_name, guild_prefix)
         VALUES ($1, $2) ON CONFLICT (guild_name) DO NOTHING`,
        [val.name, val.prefix]
      );
      prefixInserted++;
    }
  }
  console.log(`  Upserted ${prefixInserted} guild prefixes from UUID cache.`);

  // Check for any guild names still missing prefixes
  const existing = await pool.query('SELECT guild_name FROM guild_prefixes');
  const existingSet = new Set(existing.rows.map(r => r.guild_name));
  const missingPrefixes = [...guildNames].filter(g => !existingSet.has(g));

  if (missingPrefixes.length > 0) {
    console.log(`  ${missingPrefixes.length} guilds still need prefix lookup...`);
    for (const name of missingPrefixes) {
      let prefix;
      try {
        const resp = await fetch(
          `https://api.wynncraft.com/v3/guild/${encodeURIComponent(name)}`
        );
        if (resp.ok) {
          const data = await resp.json();
          prefix = data.prefix || name.substring(0, 3).toUpperCase();
        } else {
          prefix = name.substring(0, 3).toUpperCase();
        }
      } catch {
        prefix = name.substring(0, 3).toUpperCase();
      }
      await pool.query(
        `INSERT INTO guild_prefixes (guild_name, guild_prefix)
         VALUES ($1, $2) ON CONFLICT (guild_name) DO NOTHING`,
        [name, prefix]
      );
      await new Promise(r => setTimeout(r, 500));
    }
  }

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
