/**
 * Diagnostic script for territory_exchanges data.
 *
 * Reports:
 *   1. Actual MIN/MAX dates in the table
 *   2. Row counts by year/month
 *   3. What getFullCoverageTime() would return + bottleneck territory
 *   4. Territory names that don't have abbreviation mappings
 *   5. Pre-2020 territory names without mappings (with counts)
 *
 * Usage:
 *   node scripts/diagnose-exchange-data.js
 */

import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// .env loader (same pattern as import-discord-wars.js)
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
// Load territory abbreviation mappings by importing the TS source as text
// and extracting the mappings with regex.
// ---------------------------------------------------------------------------
function loadAbbreviationMappings() {
  const tsPath = path.join(__dirname, '..', 'lib', 'territory-abbreviations.ts');
  const src = fs.readFileSync(tsPath, 'utf8');

  // Extract all "Territory Name": "ABBREV" pairs from the file
  const mapping = new Map();
  const re = /"([^"]+)":\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    mapping.set(m[1], m[2]);
  }

  // Also extract DB_NAME_ALIASES
  const aliases = new Map();
  const aliasSection = src.match(/const DB_NAME_ALIASES[^{]*\{([^}]+)\}/s);
  if (aliasSection) {
    const aliasRe = /"([^"]+)":\s*"([^"]+)"/g;
    let am;
    while ((am = aliasRe.exec(aliasSection[1])) !== null) {
      aliases.set(am[1], am[2]);
    }
  }

  return { mapping, aliases };
}

// ---------------------------------------------------------------------------
// Normalize apostrophes (matches the TS normalizeApostrophes function)
// ---------------------------------------------------------------------------
function normalizeApostrophes(name) {
  return name.replace(/[\u2018\u2019\u2032\u00B4]/g, "'");
}

function canResolve(name, mapping, aliases) {
  if (mapping.has(name)) return true;
  if (mapping.has(normalizeApostrophes(name))) return true;
  const aliased = aliases.get(name);
  if (aliased && mapping.has(aliased)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Load territories_verbose.json to check location availability
// ---------------------------------------------------------------------------
function loadVerboseData() {
  const verbosePath = path.join(__dirname, '..', 'public', 'territories_verbose.json');
  try {
    return JSON.parse(fs.readFileSync(verbosePath, 'utf8'));
  } catch {
    return {};
  }
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

  const { mapping, aliases } = loadAbbreviationMappings();
  const verboseData = loadVerboseData();
  console.log(`Loaded ${mapping.size} territory abbreviation mappings, ${aliases.size} aliases`);
  console.log(`Loaded ${Object.keys(verboseData).length} territories from territories_verbose.json\n`);

  // ---- 1. Actual date bounds ----
  console.log('=== 1. Actual Date Bounds ===');
  const boundsRes = await pool.query(
    'SELECT MIN(exchange_time) AS earliest, MAX(exchange_time) AS latest, COUNT(*)::int AS total FROM territory_exchanges'
  );
  const { earliest, latest, total } = boundsRes.rows[0];
  console.log(`  Earliest: ${earliest}`);
  console.log(`  Latest:   ${latest}`);
  console.log(`  Total rows: ${total.toLocaleString()}\n`);

  // ---- 2. Row counts by year/month ----
  console.log('=== 2. Row Counts by Year/Month ===');
  const monthRes = await pool.query(`
    SELECT TO_CHAR(DATE_TRUNC('month', exchange_time), 'YYYY-MM') AS month,
           COUNT(*)::int AS cnt
    FROM territory_exchanges
    GROUP BY month ORDER BY month
  `);
  for (const row of monthRes.rows) {
    console.log(`  ${row.month}: ${row.cnt.toLocaleString()} rows`);
  }
  console.log();

  // ---- 3. Full-coverage time + bottleneck territories ----
  console.log('=== 3. Full-Coverage Time (getFullCoverageTime logic) ===');
  const coverageRes = await pool.query(`
    SELECT MAX(first_claimed) AS coverage_time
    FROM (
      SELECT MIN(exchange_time) AS first_claimed
      FROM territory_exchanges
      WHERE attacker_name != 'None'
        AND exchange_time < '2024-09-01'
      GROUP BY territory
    ) sub
  `);
  console.log(`  Coverage time (timeline start): ${coverageRes.rows[0].coverage_time}\n`);

  console.log('  Top 15 latest "first claimed" territories (bottlenecks):');
  const bottleneckRes = await pool.query(`
    SELECT territory, MIN(exchange_time) AS first_claimed
    FROM territory_exchanges
    WHERE attacker_name != 'None'
      AND exchange_time < '2024-09-01'
    GROUP BY territory
    ORDER BY first_claimed DESC
    LIMIT 15
  `);
  for (const row of bottleneckRes.rows) {
    const mapped = canResolve(row.territory, mapping, aliases) ? '' : ' [UNMAPPED]';
    console.log(`    ${row.first_claimed.toISOString().slice(0, 19)}  ${row.territory}${mapped}`);
  }
  console.log();

  // ---- 4. Unmapped territory names ----
  console.log('=== 4. Unmapped Territory Names ===');
  const allTerrsRes = await pool.query(
    'SELECT DISTINCT territory FROM territory_exchanges ORDER BY territory'
  );
  const unmapped = [];
  const unmappedNoLocation = [];
  for (const row of allTerrsRes.rows) {
    const name = row.territory;
    if (!canResolve(name, mapping, aliases)) {
      unmapped.push(name);
    } else {
      // Check if even mapped territories have location data
      // Get the full name after abbreviation round-trip
      const abbrev = mapping.get(name) || mapping.get(normalizeApostrophes(name));
      if (abbrev) {
        // Find the full name from the reverse mapping
        let fullName = null;
        for (const [n, a] of mapping) {
          if (a === abbrev) { fullName = n; break; }
        }
        if (fullName && !verboseData[fullName]?.Location) {
          unmappedNoLocation.push({ name, fullName, abbrev });
        }
      }
    }
  }

  console.log(`  Total unique territory names in DB: ${allTerrsRes.rows.length}`);
  console.log(`  Unmapped (no abbreviation): ${unmapped.length}`);
  if (unmapped.length > 0) {
    console.log(`  List of unmapped territories:`);
    for (const name of unmapped) {
      console.log(`    - "${name}"`);
    }
  }
  console.log();

  if (unmappedNoLocation.length > 0) {
    console.log(`  Mapped but NO Location data in verbose JSON: ${unmappedNoLocation.length}`);
    for (const { name, fullName, abbrev } of unmappedNoLocation) {
      console.log(`    - "${name}" -> ${abbrev} -> "${fullName}"`);
    }
    console.log();
  }

  // ---- 5. Pre-2020 unmapped territories with counts ----
  console.log('=== 5. Pre-2020 Territory Names Without Mappings ===');
  const pre2020Res = await pool.query(`
    SELECT territory, COUNT(*)::int AS cnt
    FROM territory_exchanges
    WHERE exchange_time < '2020-01-01'
    GROUP BY territory
    ORDER BY cnt DESC
  `);
  const pre2020Unmapped = pre2020Res.rows.filter(r => !canResolve(r.territory, mapping, aliases));
  console.log(`  Total unique pre-2020 territory names: ${pre2020Res.rows.length}`);
  console.log(`  Unmapped pre-2020 territory names: ${pre2020Unmapped.length}`);
  if (pre2020Unmapped.length > 0) {
    for (const row of pre2020Unmapped) {
      console.log(`    ${row.cnt.toString().padStart(6)} exchanges  "${row.territory}"`);
    }
  }
  console.log();

  // ---- 6. All pre-2020 territory names (for reference) ----
  console.log('=== 6. All Pre-2020 Territory Names (top 30 by count) ===');
  for (const row of pre2020Res.rows.slice(0, 30)) {
    const mapped = canResolve(row.territory, mapping, aliases) ? '  OK' : '  UNMAPPED';
    console.log(`  ${row.cnt.toString().padStart(6)} exchanges  "${row.territory}"${mapped}`);
  }
  if (pre2020Res.rows.length > 30) {
    console.log(`  ... and ${pre2020Res.rows.length - 30} more`);
  }

  await pool.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
