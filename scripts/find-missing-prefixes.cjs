const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { resolve } = require('path');

// Manual .env loading
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

async function main() {
  const pool = new Pool({
    user: process.env.DB_LOGIN,
    password: process.env.DB_PASS,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_DATABASE,
    ssl: { rejectUnauthorized: false },
  });

  // Get all guild prefixes from the DB
  const dbResult = await pool.query('SELECT guild_name, guild_prefix FROM guild_prefixes ORDER BY guild_name');
  const dbPrefixes = new Map();
  for (const row of dbResult.rows) {
    dbPrefixes.set(row.guild_name, row.guild_prefix);
  }
  console.log('Total guilds in guild_prefixes table:', dbPrefixes.size);

  // Find guilds whose stored prefix looks like it was guessed (first 3 chars uppercased)
  const likelyGuessed = [];
  for (const [name, prefix] of dbPrefixes) {
    const guessed = name.substring(0, 3).toUpperCase();
    if (prefix === guessed) {
      likelyGuessed.push({ name, prefix });
    }
  }
  console.log('Guilds where prefix = first 3 chars (likely guessed):', likelyGuessed.length);

  // Now get exchange counts for those likely-guessed guilds, top 50
  if (likelyGuessed.length > 0) {
    const names = likelyGuessed.map(g => g.name);
    const result = await pool.query(`
      SELECT attacker_name AS guild, COUNT(*) AS exchanges
      FROM territory_exchanges
      WHERE attacker_name = ANY($1)
      GROUP BY attacker_name
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `, [names]);

    console.log('\nTop 50 guilds with likely-guessed prefixes (by exchange count):\n');
    console.log('Rank | Exchanges | Current Prefix | Guild Name');
    console.log('-----|-----------|----------------|----------');
    for (let i = 0; i < result.rows.length; i++) {
      const r = result.rows[i];
      const rank = String(i + 1).padStart(4);
      const count = String(r.exchanges).padStart(9);
      const prefix = dbPrefixes.get(r.guild).padEnd(14);
      console.log(`${rank} | ${count} | ${prefix} | ${r.guild}`);
    }
  }

  // Also count how many guilds in guild_prefixes are NOT in territory_exchanges at all
  const totalExchangeGuilds = await pool.query(`
    SELECT COUNT(DISTINCT attacker_name) AS total
    FROM territory_exchanges
    WHERE attacker_name IS NOT NULL AND attacker_name != 'None'
  `);
  console.log('\nTotal unique guilds in territory_exchanges:', totalExchangeGuilds.rows[0].total);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
