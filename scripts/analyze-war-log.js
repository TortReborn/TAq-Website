/**
 * Analyze the moto-bot Discord war-log CSV and compare against the database.
 *
 * Usage:
 *   node scripts/analyze-war-log.js [path-to-csv]
 *
 * What it does:
 *   1. Parses and deduplicates the CSV (moto-bot format)
 *   2. Connects to the database
 *   3. Compares entries to find overlapping vs new
 *   4. Reports which gaps (if any) the new data fills
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
// CSV parser (handles double-quoted fields with embedded newlines)
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
// Content parser for moto-bot format:
//   "Territory: *Defender* (N) → **Attacker** (M)\nTerritory held for...\nAcquired: ..."
// Also handles WynnBot format:
//   "Territory: ~~Defender~~ -> **Attacker**"
// ---------------------------------------------------------------------------
// moto-bot: Territory: *Defender* (N) → **Attacker** (M)
const MOTO_RE = /^(.+): \*(.+?)\* \(\d+\) → \*\*(.+?)\*\* \(\d+\)/;
// WynnBot: Territory: ~~Defender~~ -> **Attacker**
const WYNN_RE = /^(.+): ~~(.+)~~ -> \*\*(.+)\*\*$/;

function parseContent(content) {
  // Take first line only (moto-bot has multi-line content)
  const firstLine = content.split('\n')[0].trim();

  let m = MOTO_RE.exec(firstLine);
  if (m) return { territory: m[1], defender: m[2], attacker: m[3] };

  m = WYNN_RE.exec(firstLine);
  if (m) return { territory: m[1], defender: m[2], attacker: m[3] };

  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const csvPath = process.argv[2]
    || String.raw`C:\Users\Aiden Smith\Downloads\War Log - 🌟Wynncraft - war-log [431272934141591553].csv`;

  console.log(`=== War Log Analysis ===`);
  console.log(`Input: ${csvPath}\n`);

  // ---- Phase 1: Parse and deduplicate CSV ----
  console.log(`Phase 1: Parsing and deduplicating CSV...`);

  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath),
    crlfDelay: Infinity,
  });

  let isHeader = true;
  let totalRows = 0;
  let skippedNonExchange = 0;
  let skippedDupe = 0;
  let parseErrors = 0;
  const guildNames = new Set();

  // Dedup tracking: same content within 60 seconds
  const lastSeen = new Map();

  // Parsed exchange events
  const events = [];

  // Track date range
  let earliestMs = Infinity;
  let latestMs = -Infinity;

  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    if (!line.trim()) continue;

    totalRows++;
    const parts = parseCSVLine(line);
    if (parts.length < 4) {
      parseErrors++;
      continue;
    }

    const [/* authorId */, /* author */, dateStr, content] = parts;

    const parsed = parseContent(content);
    if (!parsed) {
      skippedNonExchange++;
      continue;
    }

    // Parse timestamp
    const ts = new Date(dateStr).getTime();
    if (isNaN(ts)) {
      parseErrors++;
      continue;
    }

    // Dedup: same content within 60s
    const dedupKey = content.split('\n')[0].trim();
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
      territory: parsed.territory,
      attacker: parsed.attacker,
      defender: parsed.defender,
    });

    if (ts < earliestMs) earliestMs = ts;
    if (ts > latestMs) latestMs = ts;

    if (totalRows % 200_000 === 0) {
      process.stdout.write(`  ${totalRows.toLocaleString()} rows processed...\r`);
    }
  }

  console.log(`\n  CSV Parsing Results:`);
  console.log(`    Total data rows:        ${totalRows.toLocaleString()}`);
  console.log(`    Skipped (non-exchange): ${skippedNonExchange.toLocaleString()}`);
  console.log(`    Skipped (duplicate):    ${skippedDupe.toLocaleString()}`);
  console.log(`    Parse errors:           ${parseErrors.toLocaleString()}`);
  console.log(`    Unique exchange events: ${events.length.toLocaleString()}`);
  console.log(`    Unique guilds:          ${guildNames.size}`);
  console.log(`    Date range: ${new Date(earliestMs).toISOString()} to ${new Date(latestMs).toISOString()}`);

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

  // ---- Phase 3: Get existing DB data stats ----
  console.log(`\nPhase 3: Querying database for existing data...`);

  const countRes = await pool.query('SELECT COUNT(*)::int AS c FROM territory_exchanges');
  console.log(`  Total existing rows: ${countRes.rows[0].c.toLocaleString()}`);

  const boundsRes = await pool.query(
    `SELECT MIN(exchange_time) AS earliest, MAX(exchange_time) AS latest FROM territory_exchanges`
  );
  console.log(`  Existing range: ${boundsRes.rows[0].earliest} to ${boundsRes.rows[0].latest}`);

  // Get existing gaps (days with >1 day between them)
  const gapsRes = await pool.query(`
    WITH daily AS (
      SELECT DISTINCT DATE_TRUNC('day', exchange_time)::date AS d
      FROM territory_exchanges
    ), with_next AS (
      SELECT d, LEAD(d) OVER (ORDER BY d) AS next_d
      FROM daily
    )
    SELECT d AS gap_start, next_d AS gap_end, (next_d - d) AS gap_days
    FROM with_next
    WHERE next_d - d > 1
    ORDER BY d
  `);

  console.log(`\n  Existing gaps (>1 day):`);
  if (gapsRes.rows.length === 0) {
    console.log(`    None!`);
  } else {
    for (const gap of gapsRes.rows) {
      const start = new Date(gap.gap_start).toISOString().split('T')[0];
      const end = new Date(gap.gap_end).toISOString().split('T')[0];
      console.log(`    ${start} → ${end} (${gap.gap_days} days)`);
    }
  }

  // ---- Phase 4: Compare CSV events against database ----
  console.log(`\nPhase 4: Comparing CSV events against database...`);

  // Load all existing exchanges in the CSV's date range for comparison
  // Use a composite key: (time rounded to second, territory, attacker, defender)
  const overlapRes = await pool.query(
    `SELECT exchange_time, territory, attacker_name, defender_name
     FROM territory_exchanges
     WHERE exchange_time >= $1 AND exchange_time <= $2
     ORDER BY exchange_time`,
    [new Date(earliestMs - 86400000).toISOString(), new Date(latestMs + 86400000).toISOString()]
  );

  console.log(`  Existing DB rows in CSV date range: ${overlapRes.rows.length.toLocaleString()}`);

  // Build a set of existing event keys for fast lookup
  // Key: territory + attacker + defender + timestamp (rounded to nearest minute)
  const existingKeys = new Set();
  for (const row of overlapRes.rows) {
    const ts = new Date(row.exchange_time).getTime();
    // Round to nearest minute for fuzzy matching (different sources may have slight time offsets)
    const minuteKey = Math.round(ts / 60000);
    const key = `${row.territory}|${row.attacker_name}|${row.defender_name}|${minuteKey}`;
    existingKeys.add(key);
    // Also add +/- 1 minute for fuzzy matching
    existingKeys.add(`${row.territory}|${row.attacker_name}|${row.defender_name}|${minuteKey - 1}`);
    existingKeys.add(`${row.territory}|${row.attacker_name}|${row.defender_name}|${minuteKey + 1}`);
  }

  let overlapping = 0;
  let newEvents = 0;
  const newByDay = new Map(); // date string → count of new events

  for (const event of events) {
    const minuteKey = Math.round(event.timestampMs / 60000);
    const key = `${event.territory}|${event.attacker}|${event.defender}|${minuteKey}`;

    if (existingKeys.has(key)) {
      overlapping++;
    } else {
      newEvents++;
      const dayStr = new Date(event.timestampMs).toISOString().split('T')[0];
      newByDay.set(dayStr, (newByDay.get(dayStr) || 0) + 1);
    }
  }

  console.log(`\n  Comparison Results:`);
  console.log(`    Overlapping with DB:  ${overlapping.toLocaleString()} (${(overlapping / events.length * 100).toFixed(1)}%)`);
  console.log(`    New (not in DB):      ${newEvents.toLocaleString()} (${(newEvents / events.length * 100).toFixed(1)}%)`);

  // ---- Phase 5: Check which gaps the new data fills ----
  console.log(`\nPhase 5: Gap analysis...`);

  // Get days with new data
  const newDays = [...newByDay.keys()].sort();
  if (newDays.length > 0) {
    console.log(`\n  New data covers ${newDays.length} calendar days:`);
    console.log(`    First day: ${newDays[0]} (${newByDay.get(newDays[0])} events)`);
    console.log(`    Last day:  ${newDays[newDays.length - 1]} (${newByDay.get(newDays[newDays.length - 1])} events)`);
  }

  // Check each gap
  if (gapsRes.rows.length > 0) {
    console.log(`\n  Gap fill analysis:`);
    for (const gap of gapsRes.rows) {
      const gapStartMs = new Date(gap.gap_start).getTime();
      const gapEndMs = new Date(gap.gap_end).getTime();

      let eventsInGap = 0;
      let daysInGap = new Set();
      for (const event of events) {
        if (event.timestampMs >= gapStartMs && event.timestampMs <= gapEndMs) {
          eventsInGap++;
          daysInGap.add(new Date(event.timestampMs).toISOString().split('T')[0]);
        }
      }

      const gapStart = new Date(gap.gap_start).toISOString().split('T')[0];
      const gapEnd = new Date(gap.gap_end).toISOString().split('T')[0];
      const gapDays = gap.gap_days;

      if (eventsInGap > 0) {
        const fillPct = (daysInGap.size / gapDays * 100).toFixed(0);
        console.log(`    ✓ Gap ${gapStart} → ${gapEnd} (${gapDays}d): ${eventsInGap} events across ${daysInGap.size} days (${fillPct}% fill)`);
      } else {
        console.log(`    ✗ Gap ${gapStart} → ${gapEnd} (${gapDays}d): No new data`);
      }
    }
  }

  // ---- Phase 6: Show daily distribution of new events ----
  console.log(`\n  Monthly distribution of new events:`);
  const monthlyNew = new Map();
  for (const [day, count] of newByDay) {
    const month = day.substring(0, 7); // YYYY-MM
    monthlyNew.set(month, (monthlyNew.get(month) || 0) + count);
  }
  const sortedMonths = [...monthlyNew.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [month, count] of sortedMonths) {
    const bar = '█'.repeat(Math.min(60, Math.round(count / 100)));
    console.log(`    ${month}: ${count.toLocaleString().padStart(6)} ${bar}`);
  }

  // ---- Phase 7: Check for data before our existing earliest ----
  const dbEarliestMs = new Date(boundsRes.rows[0].earliest).getTime();
  const eventsBefore = events.filter(e => e.timestampMs < dbEarliestMs);
  if (eventsBefore.length > 0) {
    console.log(`\n  ⭐ Events BEFORE current DB earliest (${boundsRes.rows[0].earliest}):`);
    console.log(`    ${eventsBefore.length.toLocaleString()} events`);
    const earliestNew = eventsBefore.reduce((min, e) => e.timestampMs < min ? e.timestampMs : min, Infinity);
    console.log(`    Earliest: ${new Date(earliestNew).toISOString()}`);
    console.log(`    This would extend the history by ${Math.round((dbEarliestMs - earliestNew) / 86400000)} days!`);
  }

  // ---- Phase 8: Check for data after our existing latest ----
  const dbLatestMs = new Date(boundsRes.rows[0].latest).getTime();
  const eventsAfter = events.filter(e => e.timestampMs > dbLatestMs);
  if (eventsAfter.length > 0) {
    console.log(`\n  ⭐ Events AFTER current DB latest (${boundsRes.rows[0].latest}):`);
    console.log(`    ${eventsAfter.length.toLocaleString()} events`);
  }

  await pool.end();
  console.log(`\n=== Analysis Complete ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
