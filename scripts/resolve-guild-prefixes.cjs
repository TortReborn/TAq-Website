/**
 * resolve-guild-prefixes.cjs
 *
 * Finds all guilds in guild_prefixes whose prefix looks guessed (first 3 chars
 * of the name uppercased) and queries the Wynncraft v3 API for the real prefix.
 *
 * Results are:
 *   1. Written to  data/guild-prefix-overrides.json  (repo reference file)
 *   2. Updated in the guild_prefixes database table
 *
 * The JSON file acts as a persistent record so that even if a guild is later
 * deleted from Wynncraft, we still know the correct prefix it had.
 *
 * Usage:
 *   node scripts/resolve-guild-prefixes.cjs            # dry-run (file only)
 *   node scripts/resolve-guild-prefixes.cjs --apply    # also update the DB
 */

const { Pool } = require('pg');
const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const { resolve } = require('path');

// ── env ────────────────────────────────────────────────────────────────────
const envPath = resolve(__dirname, '..', '.env');
const envContent = readFileSync(envPath, 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx).trim();
  const val = trimmed.slice(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const APPLY = process.argv.includes('--apply');
const RATE_LIMIT_MS = 250; // 4 req/s to stay under Wynncraft limits
const OUTPUT_PATH = resolve(__dirname, '..', 'data', 'guild-prefix-overrides.json');

// ── helpers ────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function isGuessedPrefix(name, prefix) {
  return prefix === name.substring(0, 3).toUpperCase();
}

async function fetchGuildPrefix(guildName) {
  const url = `https://api.wynncraft.com/v3/guild/${encodeURIComponent(guildName)}`;
  const resp = await fetch(url);
  if (resp.status === 429) {
    // rate limited — back off and retry once
    console.log(`  ⏳ Rate limited, waiting 5s...`);
    await sleep(5000);
    const retry = await fetch(url);
    if (!retry.ok) return null;
    const data = await retry.json();
    return data.prefix || null;
  }
  if (!resp.ok) return null; // guild not found / deleted
  const data = await resp.json();
  return data.prefix || null;
}

// ── main ───────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({
    user: process.env.DB_LOGIN,
    password: process.env.DB_PASS,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  // 1. Load existing overrides file if it exists (to preserve past lookups)
  let overrides = {};
  if (existsSync(OUTPUT_PATH)) {
    try {
      overrides = JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'));
      console.log(`Loaded ${Object.keys(overrides).length} existing overrides from file.`);
    } catch {
      console.log('Could not parse existing overrides file, starting fresh.');
    }
  }

  // 2. Get all guilds with guessed prefixes from the DB
  const dbResult = await pool.query('SELECT guild_name, guild_prefix FROM guild_prefixes ORDER BY guild_name');
  const guessed = [];
  for (const row of dbResult.rows) {
    if (isGuessedPrefix(row.guild_name, row.guild_prefix)) {
      guessed.push(row.guild_name);
    }
  }
  console.log(`\nTotal guilds in DB: ${dbResult.rows.length}`);
  console.log(`Guilds with guessed prefixes: ${guessed.length}`);

  // 3. Filter out guilds we already resolved in a previous run
  const toFetch = guessed.filter(name => !(name in overrides));
  console.log(`Already resolved: ${guessed.length - toFetch.length}`);
  console.log(`To fetch from API: ${toFetch.length}\n`);

  // 4. Query Wynncraft API for each guild
  let resolved = 0;
  let notFound = 0;
  let errors = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const name = toFetch[i];
    const progress = `[${i + 1}/${toFetch.length}]`;

    try {
      const realPrefix = await fetchGuildPrefix(name);

      if (realPrefix) {
        overrides[name] = { prefix: realPrefix, source: 'wynncraft-api' };
        const changed = realPrefix !== name.substring(0, 3).toUpperCase();
        console.log(`${progress} ${name}: ${name.substring(0, 3).toUpperCase()} -> ${realPrefix}${changed ? ' ✓ CHANGED' : ' (same)'}`);
        resolved++;
      } else {
        // Guild not found in API — mark it so we don't re-query
        overrides[name] = { prefix: name.substring(0, 3).toUpperCase(), source: 'not-found' };
        console.log(`${progress} ${name}: NOT FOUND in API (keeping ${name.substring(0, 3).toUpperCase()})`);
        notFound++;
      }
    } catch (err) {
      console.error(`${progress} ${name}: ERROR - ${err.message}`);
      errors++;
    }

    // Rate limit
    if (i < toFetch.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }

    // Save progress every 50 guilds (in case of interruption)
    if ((i + 1) % 50 === 0) {
      saveOverrides(overrides);
      console.log(`  💾 Progress saved (${i + 1}/${toFetch.length})\n`);
    }
  }

  // 5. Save final overrides file
  saveOverrides(overrides);

  // 6. Print summary
  const allResolved = Object.values(overrides);
  const fromApi = allResolved.filter(v => v.source === 'wynncraft-api');
  const missing = allResolved.filter(v => v.source === 'not-found');

  console.log(`\n=== SUMMARY ===`);
  console.log(`This run: ${resolved} resolved, ${notFound} not found, ${errors} errors`);
  console.log(`Total in file: ${allResolved.length} entries (${fromApi.length} from API, ${missing.length} not found)`);
  console.log(`Saved to: ${OUTPUT_PATH}`);

  // 7. Optionally apply to DB
  if (APPLY) {
    console.log('\nApplying changes to database...');
    let updated = 0;
    for (const [name, info] of Object.entries(overrides)) {
      if (info.source === 'wynncraft-api') {
        await pool.query(
          'UPDATE guild_prefixes SET guild_prefix = $1 WHERE guild_name = $2 AND guild_prefix != $1',
          [info.prefix, name]
        );
        updated++;
      }
    }
    console.log(`Updated ${updated} guild prefixes in database.`);
  } else {
    console.log('\nDry run — pass --apply to also update the database.');
  }

  await pool.end();
}

function saveOverrides(overrides) {
  const dir = resolve(__dirname, '..', 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Sort by guild name for readable diffs
  const sorted = Object.fromEntries(
    Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2) + '\n');
}

main().catch(e => { console.error(e); process.exit(1); });
