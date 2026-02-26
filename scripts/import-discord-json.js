/**
 * Import Discord JSON export (embed-based territory tracker) into territory_exchanges,
 * deduplicating against both itself and the existing database.
 *
 * Usage:
 *   node scripts/import-discord-json.js [path-to-json]
 *
 * Supports the embed format used by bots like Botfox / Heliosphere:
 *   embed.fields[].name  = territory name
 *   embed.fields[].value = "Defender (N -> N-1) -> **Attacker** (M -> M+1)\n..."
 *   embed.timestamp       = exchange time
 */

import fs from 'fs';
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
// Field value parser:
//   "Defender (N -> N-1) -> **Attacker** (M -> M+1)\nHeld for: ..."
// ---------------------------------------------------------------------------
const FIELD_RE = /^(.+?)\s*\(\d+\s*->\s*\d+\)\s*->\s*\*\*(.+?)\*\*\s*\(\d+\s*->\s*\d+\)/;

function parseFieldValue(value) {
  const firstLine = value.split('\n')[0].trim();
  const m = FIELD_RE.exec(firstLine);
  if (!m) return null;
  return { defender: m[1].trim(), attacker: m[2].trim() };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const jsonPath = process.argv[2];
  if (!jsonPath) {
    console.error('Usage: node scripts/import-discord-json.js <path-to-json>');
    process.exit(1);
  }

  console.log(`=== Discord JSON Import ===`);
  console.log(`Input: ${jsonPath}\n`);

  // ---- Phase 1: Parse JSON ----
  console.log(`Phase 1: Parsing JSON...`);

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const messages = raw.messages || [];
  console.log(`  Total messages: ${messages.length}`);

  const guildNames = new Set();
  const lastSeen = new Map();
  const events = [];
  let skippedNoField = 0;
  let skippedInfoField = 0;
  let parseErrors = 0;
  let skippedDupe = 0;
  let earliestMs = Infinity;
  let latestMs = -Infinity;

  for (const msg of messages) {
    for (const embed of (msg.embeds || [])) {
      // Use embed timestamp if available, fall back to message timestamp
      const tsStr = embed.timestamp || msg.timestamp;
      const ts = new Date(tsStr).getTime();
      if (isNaN(ts)) { parseErrors++; continue; }

      for (const field of (embed.fields || [])) {
        // Skip info/announcement fields
        if (field.name.includes('ℹ️') || field.name.includes('New Tracker')) {
          skippedInfoField++;
          continue;
        }

        const parsed = parseFieldValue(field.value);
        if (!parsed) { parseErrors++; continue; }

        const territory = field.name;

        // Internal dedup: same territory+attacker+defender within 60s
        const dedupKey = `${territory}|${parsed.attacker}|${parsed.defender}`;
        const prev = lastSeen.get(dedupKey);
        if (prev !== undefined && Math.abs(ts - prev) < 60_000) {
          skippedDupe++;
          continue;
        }
        lastSeen.set(dedupKey, ts);

        guildNames.add(parsed.attacker);
        guildNames.add(parsed.defender);

        events.push({
          timestamp: new Date(ts).toISOString(),
          timestampMs: ts,
          territory,
          attacker: parsed.attacker,
          defender: parsed.defender,
        });

        if (ts < earliestMs) earliestMs = ts;
        if (ts > latestMs) latestMs = ts;
      }
    }
  }

  console.log(`\n  Parse Results:`);
  console.log(`    Skipped (info fields):  ${skippedInfoField}`);
  console.log(`    Skipped (internal dup): ${skippedDupe}`);
  console.log(`    Parse errors:           ${parseErrors}`);
  console.log(`    Unique exchange events: ${events.length}`);
  if (events.length > 0) {
    console.log(`    Date range: ${new Date(earliestMs).toISOString()} to ${new Date(latestMs).toISOString()}`);
  }

  if (events.length === 0) {
    console.log(`\nNo events found. Done.`);
    return;
  }

  // ---- Phase 2: Connect to database ----
  console.log(`\nPhase 2: Connecting to database...`);

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

  console.log(`  Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  const pool = new pg.Pool({ ...dbConfig, max: 3 });

  // Ensure tables exist
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_territory_exchanges.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_guild_prefixes.sql'), 'utf8'));

  const beforeRes = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  console.log(`  Existing rows: ${beforeRes.rows[0].c.toLocaleString()}`);

  // ---- Phase 3: Load existing events for dedup ----
  console.log(`\nPhase 3: Loading existing events for dedup...`);

  const overlapRes = await pool.query(
    `SELECT exchange_time, territory, attacker_name, defender_name
     FROM territory_exchanges
     WHERE exchange_time >= $1 AND exchange_time <= $2`,
    [new Date(earliestMs - 86400000).toISOString(), new Date(latestMs + 86400000).toISOString()]
  );
  console.log(`  Loaded ${overlapRes.rows.length.toLocaleString()} existing events in range`);

  // Build fuzzy-match set: territory+attacker+defender+minuteKey (±1 min)
  const existingKeys = new Set();
  for (const row of overlapRes.rows) {
    const ts = new Date(row.exchange_time).getTime();
    const minuteKey = Math.round(ts / 60000);
    const base = `${row.territory}|${row.attacker_name}|${row.defender_name}`;
    existingKeys.add(`${base}|${minuteKey - 1}`);
    existingKeys.add(`${base}|${minuteKey}`);
    existingKeys.add(`${base}|${minuteKey + 1}`);
  }

  // ---- Phase 4: Filter to new-only events ----
  console.log(`\nPhase 4: Filtering to new events...`);

  const newEvents = [];
  let dbDupes = 0;

  for (const event of events) {
    const minuteKey = Math.round(event.timestampMs / 60000);
    const key = `${event.territory}|${event.attacker}|${event.defender}|${minuteKey}`;
    if (existingKeys.has(key)) {
      dbDupes++;
    } else {
      newEvents.push(event);
    }
  }

  console.log(`  Already in DB (skipped): ${dbDupes.toLocaleString()}`);
  console.log(`  New events to insert:    ${newEvents.length.toLocaleString()}`);

  if (newEvents.length === 0) {
    console.log(`\nNo new events to insert. Done.`);
    await pool.end();
    return;
  }

  // ---- Phase 5: Batch insert new events ----
  console.log(`\nPhase 5: Inserting ${newEvents.length.toLocaleString()} new events...`);

  const BATCH_SIZE = 2000;
  let batch = { times: [], terrs: [], attackers: [], defenders: [] };
  let insertCount = 0;
  let batchCount = 0;

  for (const event of newEvents) {
    batch.times.push(event.timestamp);
    batch.terrs.push(event.territory);
    batch.attackers.push(event.attacker);
    batch.defenders.push(event.defender);
    insertCount++;

    if (batch.times.length >= BATCH_SIZE) {
      await pool.query(
        `INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)
         SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[])`,
        [batch.times, batch.terrs, batch.attackers, batch.defenders]
      );
      batchCount++;
      batch = { times: [], terrs: [], attackers: [], defenders: [] };
      if (batchCount % 10 === 0) {
        console.log(`  ${insertCount.toLocaleString()} / ${newEvents.length.toLocaleString()} inserted...`);
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

  console.log(`  Inserted ${insertCount.toLocaleString()} rows (${batchCount} batches).`);

  // ---- Phase 6: Fetch missing guild prefixes ----
  console.log('\nPhase 6: Fetching missing guild prefixes...');

  const existing = await pool.query('SELECT guild_name FROM guild_prefixes');
  const existingPrefixSet = new Set(existing.rows.map(r => r.guild_name));
  const toFetch = [...guildNames].filter(g => !existingPrefixSet.has(g));
  console.log(`  ${existingPrefixSet.size} prefixes already stored, ${toFetch.length} new guilds to fetch.`);

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

  if (toFetch.length > 0) {
    console.log(`  Prefix fetch done: ${fetched} from API, ${fallback} fallback.`);
  }

  // ---- Summary ----
  const afterRes = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  const prefixRes = await pool.query('SELECT COUNT(*)::int AS c FROM guild_prefixes');

  const gapsRes = await pool.query(`
    WITH daily AS (
      SELECT DISTINCT DATE_TRUNC('day', exchange_time)::date AS d
      FROM territory_exchanges
    ), with_next AS (
      SELECT d, LEAD(d) OVER (ORDER BY d) AS next_d
      FROM daily
    )
    SELECT COUNT(*)::int AS gap_count
    FROM with_next
    WHERE next_d - d > 1
  `);

  console.log(`\n=== Import Complete ===`);
  console.log(`  territory_exchanges: ${beforeRes.rows[0].c.toLocaleString()} → ${afterRes.rows[0].c.toLocaleString()} (+${insertCount.toLocaleString()})`);
  console.log(`  guild_prefixes:      ${prefixRes.rows[0].c.toLocaleString()}`);
  console.log(`  Remaining gaps:      ${gapsRes.rows[0].gap_count}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
