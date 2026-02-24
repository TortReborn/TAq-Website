/**
 * Backfill territory_snapshots -> territory_exchanges.
 *
 * Reads all territory_snapshots in chronological order, diffs consecutive
 * snapshots to find ownership changes, and inserts them into
 * territory_exchanges.
 *
 * Auto-cutoff: stops at the latest existing exchange time to avoid
 * overlapping with bot-written exchanges.
 *
 * Usage:
 *   node scripts/backfill-snapshots-to-exchanges.js [--dry-run] [--force]
 */

import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// .env loader (same as import-exchanges.js)
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
// Load abbreviation reverse mapping (abbrev -> full name) from TS file
// ---------------------------------------------------------------------------
function loadAbbrevToName() {
  const tsPath = path.join(__dirname, '..', 'lib', 'territory-abbreviations.ts');
  const content = fs.readFileSync(tsPath, 'utf8');
  const map = {};
  // Match "Full Name": "ABBREV" pairs in TERRITORY_TO_ABBREV
  const regex = /"([^"]+)":\s*"([^"]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const abbrev = match[2];
    // Abbreviations are short (2-5 chars), names are longer
    if (abbrev.length <= 5 && name.length > abbrev.length) {
      map[abbrev] = name;
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  if (dryRun) console.log('*** DRY RUN — no data will be inserted ***\n');

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

  // Load abbreviation mapping
  const abbrevToName = loadAbbrevToName();
  console.log(`Loaded ${Object.keys(abbrevToName).length} territory abbreviation mappings.`);

  // Ensure tables exist
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_territory_exchanges.sql'), 'utf8'));
  await pool.query(fs.readFileSync(path.join(__dirname, '..', 'sql', 'create_guild_prefixes.sql'), 'utf8'));

  // Auto-cutoff: find the earliest bot-written exchange that overlaps
  // with the snapshot time range. Bot-written exchanges (from Phase 1)
  // will have timestamps WITHIN the snapshot range. Old CSV-imported
  // exchanges end well before snapshots start, so they don't count.
  const snapRangeResult = await pool.query(`
    SELECT MIN(snapshot_time) AS snap_earliest, MAX(snapshot_time) AS snap_latest
    FROM territory_snapshots
  `);
  const snapEarliest = snapRangeResult.rows[0]?.snap_earliest;
  const snapLatest = snapRangeResult.rows[0]?.snap_latest;

  let cutoffTime = null;
  if (snapEarliest) {
    const overlapResult = await pool.query(`
      SELECT MIN(exchange_time) AS first_overlap
      FROM territory_exchanges
      WHERE exchange_time >= $1
    `, [snapEarliest.toISOString()]);
    cutoffTime = overlapResult.rows[0]?.first_overlap || null;
  }

  if (cutoffTime) {
    console.log(`Auto-cutoff: bot exchanges found starting at ${cutoffTime.toISOString()}`);
    console.log(`  Will only backfill snapshots before that time.`);
  } else {
    console.log('No overlapping bot exchanges found — backfilling all snapshots.');
  }

  // Load snapshots (up to cutoff if one exists)
  let snapshotQuery = `
    SELECT snapshot_time, territories
    FROM territory_snapshots
    ORDER BY snapshot_time ASC
  `;
  const snapshotParams = [];
  if (cutoffTime) {
    snapshotQuery = `
      SELECT snapshot_time, territories
      FROM territory_snapshots
      WHERE snapshot_time < $1
      ORDER BY snapshot_time ASC
    `;
    snapshotParams.push(cutoffTime.toISOString());
  }

  const snapResult = await pool.query(snapshotQuery, snapshotParams);
  console.log(`Loaded ${snapResult.rows.length} snapshots to process.`);

  if (snapResult.rows.length < 2) {
    console.log('Need at least 2 snapshots to diff. Nothing to do.');
    await pool.end();
    return;
  }

  // Check for existing backfilled data in the snapshot time range
  const firstSnapTime = snapResult.rows[0].snapshot_time;
  const lastSnapTime = snapResult.rows[snapResult.rows.length - 1].snapshot_time;

  const existingCheck = await pool.query(`
    SELECT COUNT(*)::int AS c FROM territory_exchanges
    WHERE exchange_time >= $1 AND exchange_time <= $2
  `, [firstSnapTime.toISOString(), lastSnapTime.toISOString()]);

  if (existingCheck.rows[0].c > 0 && !force && !dryRun) {
    console.log(`\nWARNING: ${existingCheck.rows[0].c} exchanges already exist in snapshot time range`);
    console.log(`  (${firstSnapTime.toISOString()} to ${lastSnapTime.toISOString()})`);
    console.log('\nTo re-run, either:');
    console.log('  1. Use --force to insert anyway (may create duplicates)');
    console.log('  2. Delete existing data first:');
    console.log(`     DELETE FROM territory_exchanges WHERE exchange_time >= '${firstSnapTime.toISOString()}' AND exchange_time <= '${lastSnapTime.toISOString()}';`);
    await pool.end();
    return;
  }

  // Diff consecutive snapshots
  let prevState = null;  // Map: full_territory_name -> { guild: string, prefix: string }
  let totalExchanges = 0;
  let batch = { times: [], terrs: [], attackers: [], defenders: [] };
  const BATCH_SIZE = 2000;
  const guildsSeen = new Map(); // guild_name -> guild_prefix

  async function flushBatch() {
    if (batch.times.length === 0) return;
    if (!dryRun) {
      await pool.query(
        `INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)
         SELECT * FROM unnest($1::timestamptz[], $2::text[], $3::text[], $4::text[])`,
        [batch.times, batch.terrs, batch.attackers, batch.defenders]
      );
    }
    batch = { times: [], terrs: [], attackers: [], defenders: [] };
  }

  for (let i = 0; i < snapResult.rows.length; i++) {
    const row = snapResult.rows[i];
    const territories = row.territories; // JSONB: { abbrev: { g, n }, ... }
    const currentState = new Map();

    for (const [abbrev, data] of Object.entries(territories)) {
      const fullName = abbrevToName[abbrev] || abbrev;
      currentState.set(fullName, { guild: data.n, prefix: data.g });

      // Track guild prefixes
      if (data.n && data.n !== 'None') {
        guildsSeen.set(data.n, data.g);
      }
    }

    if (prevState !== null) {
      // Find all territories that exist in either state
      const allTerritories = new Set([...prevState.keys(), ...currentState.keys()]);

      for (const terr of allTerritories) {
        const oldGuild = prevState.get(terr)?.guild || 'None';
        const newGuild = currentState.get(terr)?.guild || 'None';

        if (oldGuild !== newGuild) {
          batch.times.push(row.snapshot_time.toISOString());
          batch.terrs.push(terr);
          batch.attackers.push(newGuild);
          batch.defenders.push(oldGuild);
          totalExchanges++;

          if (batch.times.length >= BATCH_SIZE) {
            await flushBatch();
          }
        }
      }
    }

    prevState = currentState;

    // Progress logging
    if ((i + 1) % 1000 === 0) {
      console.log(`  Processed ${i + 1}/${snapResult.rows.length} snapshots, ${totalExchanges} exchanges so far...`);
    }
  }

  // Flush remaining
  await flushBatch();

  console.log(`\nBackfill complete: ${totalExchanges} exchanges from ${snapResult.rows.length} snapshots.`);

  // Upsert guild prefixes
  if (!dryRun && guildsSeen.size > 0) {
    console.log(`\nUpserting ${guildsSeen.size} guild prefixes...`);
    for (const [guildName, guildPrefix] of guildsSeen) {
      await pool.query(
        `INSERT INTO guild_prefixes (guild_name, guild_prefix)
         VALUES ($1, $2)
         ON CONFLICT (guild_name) DO UPDATE SET guild_prefix = EXCLUDED.guild_prefix`,
        [guildName, guildPrefix]
      );
    }
  }

  // Summary
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
