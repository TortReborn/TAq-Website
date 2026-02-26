/**
 * Generate deterministic colors for guilds that don't have API-sourced colors.
 *
 * Reads all guild names from territory_exchanges and guild_prefixes,
 * checks which ones already have a real color in the cache_entries
 * guildColors cache, and generates stable hash-based colors for the rest.
 *
 * Colors are stored in the guild_generated_colors table (separate from
 * the API cache) so they never overwrite authoritative data.
 *
 * Usage:
 *   node scripts/generate-guild-colors.js [--dry-run]
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
// Deterministic color generation
// ---------------------------------------------------------------------------

/**
 * Simple string hash (djb2). Returns a positive 32-bit integer.
 */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Convert HSL to hex color string.
 * h: 0-360, s: 0-1, l: 0-1
 */
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;

  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }

  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Generate a visually distinct, saturated color from a guild name.
 * Uses golden-ratio hue distribution for even spacing, with
 * constrained saturation (60-85%) and lightness (45-60%) to keep
 * colors vivid but readable on both dark and light backgrounds.
 */
function generateColor(guildName) {
  const hash = hashString(guildName);

  // Golden ratio for well-distributed hues
  const hue = (hash * 137.508) % 360;

  // Use different bits of the hash for saturation and lightness variation
  const saturation = 0.60 + ((hash >>> 8) % 26) / 100;   // 0.60–0.85
  const lightness  = 0.45 + ((hash >>> 16) % 16) / 100;  // 0.45–0.60

  return hslToHex(hue, saturation, lightness);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  loadEnv();

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  if (dryRun) console.log('*** DRY RUN — no data will be written ***\n');

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

  // Ensure the generated colors table exists
  const sqlPath = path.join(__dirname, '..', 'sql', 'create_guild_generated_colors.sql');
  await pool.query(fs.readFileSync(sqlPath, 'utf8'));

  // 1. Collect all guild names from exchanges and prefixes
  console.log('\nCollecting guild names...');

  const exchangeGuilds = await pool.query(`
    SELECT DISTINCT attacker_name AS guild FROM territory_exchanges
    WHERE attacker_name != 'None'
    UNION
    SELECT DISTINCT defender_name AS guild FROM territory_exchanges
    WHERE defender_name != 'None'
  `);

  const prefixGuilds = await pool.query(`
    SELECT guild_name AS guild FROM guild_prefixes
  `);

  const allGuilds = new Set();
  for (const row of exchangeGuilds.rows) allGuilds.add(row.guild);
  for (const row of prefixGuilds.rows) allGuilds.add(row.guild);
  allGuilds.delete('None');
  allGuilds.delete('');

  console.log(`  Found ${allGuilds.size} unique guild names.`);

  // 2. Load existing API-sourced colors from cache
  let apiColoredGuilds = new Set();
  try {
    const cacheResult = await pool.query(
      `SELECT data FROM cache_entries WHERE cache_key = 'guildColors'`
    );
    if (cacheResult.rows.length > 0) {
      const cachedData = cacheResult.rows[0].data;
      if (Array.isArray(cachedData)) {
        for (const entry of cachedData) {
          if (entry.color && entry._id) {
            apiColoredGuilds.add(entry._id);
          }
        }
      }
    }
    console.log(`  ${apiColoredGuilds.size} guilds already have API-sourced colors.`);
  } catch {
    console.log('  No API-sourced colors found (cache_entries table may not exist).');
  }

  // 3. Load existing generated colors
  let existingGenerated = new Map();
  try {
    const genResult = await pool.query(`SELECT guild_name, color FROM guild_generated_colors`);
    for (const row of genResult.rows) {
      existingGenerated.set(row.guild_name, row.color);
    }
    console.log(`  ${existingGenerated.size} guilds already have generated colors.`);
  } catch {
    // Table was just created, empty
  }

  // 4. Generate colors for guilds that need them
  const toGenerate = [];
  let skippedApi = 0;
  let skippedExisting = 0;

  for (const guild of allGuilds) {
    if (apiColoredGuilds.has(guild)) {
      skippedApi++;
      continue;
    }
    if (existingGenerated.has(guild)) {
      skippedExisting++;
      continue;
    }
    toGenerate.push({ name: guild, color: generateColor(guild) });
  }

  console.log(`\n  Skipped ${skippedApi} (have API colors)`);
  console.log(`  Skipped ${skippedExisting} (already generated)`);
  console.log(`  Generating colors for ${toGenerate.length} guilds...`);

  if (toGenerate.length > 0) {
    // Show a sample
    const sample = toGenerate.slice(0, 10);
    for (const { name, color } of sample) {
      console.log(`    ${color}  ${name}`);
    }
    if (toGenerate.length > 10) {
      console.log(`    ... and ${toGenerate.length - 10} more`);
    }
  }

  // 5. Insert generated colors
  if (!dryRun && toGenerate.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < toGenerate.length; i += BATCH_SIZE) {
      const batch = toGenerate.slice(i, i + BATCH_SIZE);
      const names = batch.map(g => g.name);
      const colors = batch.map(g => g.color);

      await pool.query(
        `INSERT INTO guild_generated_colors (guild_name, color)
         SELECT * FROM unnest($1::text[], $2::text[])
         ON CONFLICT (guild_name) DO UPDATE SET color = EXCLUDED.color`,
        [names, colors]
      );
    }
  }

  // -----------------------------------------------------------------------
  // 6. Validate and fix guild prefixes
  //    - Must be at least 3 characters
  //    - Must be alphabetic only (no symbols, spaces, or numbers)
  //    - If invalid, regenerate from guild name (first 3 alpha chars, uppercased)
  // -----------------------------------------------------------------------
  console.log('\n--- Validating guild prefixes ---');

  const prefixResult = await pool.query('SELECT guild_name, guild_prefix FROM guild_prefixes');
  const invalidPrefixes = [];

  for (const row of prefixResult.rows) {
    const { guild_name, guild_prefix } = row;
    const isValid = guild_prefix
      && guild_prefix.length >= 3
      && /^[A-Za-z]+$/.test(guild_prefix);

    if (!isValid) {
      // Generate a clean prefix: first 3 alphabetic characters from the name
      const alphaChars = guild_name.replace(/[^A-Za-z]/g, '');
      const newPrefix = alphaChars.length >= 3
        ? alphaChars.substring(0, 3).toUpperCase()
        : (alphaChars + 'XXX').substring(0, 3).toUpperCase();

      invalidPrefixes.push({
        guild: guild_name,
        oldPrefix: guild_prefix,
        newPrefix,
      });
    }
  }

  if (invalidPrefixes.length > 0) {
    console.log(`  Found ${invalidPrefixes.length} invalid prefixes:`);
    for (const { guild, oldPrefix, newPrefix } of invalidPrefixes) {
      console.log(`    "${oldPrefix}" → "${newPrefix}"  (${guild})`);
    }

    if (!dryRun) {
      for (const { guild, newPrefix } of invalidPrefixes) {
        await pool.query(
          `UPDATE guild_prefixes SET guild_prefix = $1 WHERE guild_name = $2`,
          [newPrefix, guild]
        );
      }
      console.log(`  Fixed ${invalidPrefixes.length} prefixes.`);
    }
  } else {
    console.log('  All prefixes are valid.');
  }

  // Final counts
  if (!dryRun) {
    const finalCount = await pool.query('SELECT COUNT(*)::int AS c FROM guild_generated_colors');
    console.log(`\nDone. guild_generated_colors now has ${finalCount.rows[0].c} entries.`);
  } else {
    console.log(`\nDry run complete. Would have inserted ${toGenerate.length} colors, fixed ${invalidPrefixes.length} prefixes.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
