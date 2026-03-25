/**
 * Fetches members with DPS / Tank / Healer roles from the TAQ Discord server
 * and populates the member_war_roles table via discord_links UUID mapping.
 *
 * Usage:
 *   node scripts/populate_war_roles.cjs --target test
 *   node scripts/populate_war_roles.cjs --target prod
 *   node scripts/populate_war_roles.cjs --target both
 */

const pg = require('pg');
const fs = require('fs');
const path = require('path');

// ── Load .env ───────────────────────────────────────────────────────────────
const envPath = path.resolve(__dirname, '..', '.env');
const envLines = fs.readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  env[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
}

// ── Config ──────────────────────────────────────────────────────────────────
const TEST_MODE = (env.TEST_MODE || '').toLowerCase() === 'true';

const GUILD_IDS = {
  prod: '729147655875199017',
  test: '1369134564450107412',
};

// Discord role names → DB role values
const ROLE_MAP = {
  'DPS':    'DPS',
  'Tank':   'TANK',
  'Healer': 'HEALER',
};

const DB_CONFIGS = {
  test: {
    user: env.TEST_DB_LOGIN,
    password: env.TEST_DB_PASS,
    host: env.TEST_DB_HOST,
    port: parseInt(env.TEST_DB_PORT || '5432'),
    database: env.TEST_DB_DATABASE,
    ssl: env.TEST_DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  },
  prod: {
    user: env.DB_LOGIN,
    password: env.DB_PASS,
    host: env.DB_HOST,
    port: parseInt(env.DB_PORT || '5432'),
    database: env.DB_DATABASE,
    ssl: env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  },
};

const BOT_TOKENS = {
  test: env.TEST_DISCORD_BOT_TOKEN,
  prod: env.DISCORD_BOT_TOKEN,
};

// ── Discord REST helpers ────────────────────────────────────────────────────
const DISCORD_API = 'https://discord.com/api/v10';

async function discordGet(endpoint, token) {
  const res = await fetch(`${DISCORD_API}${endpoint}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Discord API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchGuildRoles(guildId, token) {
  return discordGet(`/guilds/${guildId}/roles`, token);
}

async function fetchAllMembers(guildId, token) {
  const members = [];
  let after = '0';
  while (true) {
    const batch = await discordGet(
      `/guilds/${guildId}/members?limit=1000&after=${after}`,
      token,
    );
    if (batch.length === 0) break;
    members.push(...batch);
    after = batch[batch.length - 1].user.id;
    if (batch.length < 1000) break;
  }
  return members;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function populateTarget(target) {
  const token = BOT_TOKENS[target];
  const guildId = GUILD_IDS[target];
  const dbConfig = DB_CONFIGS[target];

  if (!token) {
    console.error(`  No bot token for ${target}, skipping.`);
    return;
  }

  console.log(`\n── ${target.toUpperCase()} (guild ${guildId}) ──`);

  // 1. Get role IDs for DPS / Tank / Healer
  const roles = await fetchGuildRoles(guildId, token);
  const targetRoles = {}; // roleId → DB role string
  for (const role of roles) {
    if (ROLE_MAP[role.name]) {
      targetRoles[role.id] = ROLE_MAP[role.name];
      console.log(`  Found role "${role.name}" → id ${role.id}`);
    }
  }

  const foundNames = Object.values(targetRoles);
  for (const name of Object.keys(ROLE_MAP)) {
    if (!foundNames.includes(ROLE_MAP[name])) {
      console.warn(`  ⚠ Role "${name}" not found in guild!`);
    }
  }

  // 2. Fetch all guild members and filter to those with target roles
  console.log('  Fetching guild members...');
  const members = await fetchAllMembers(guildId, token);
  console.log(`  Total members: ${members.length}`);

  // discordId → Set<role>
  const memberRoles = new Map();
  for (const member of members) {
    const discordId = member.user.id;
    for (const roleId of member.roles) {
      if (targetRoles[roleId]) {
        if (!memberRoles.has(discordId)) memberRoles.set(discordId, new Set());
        memberRoles.get(discordId).add(targetRoles[roleId]);
      }
    }
  }
  console.log(`  Members with war roles: ${memberRoles.size}`);

  // 3. Connect to DB and resolve discord_id → uuid
  const pool = new pg.Pool(dbConfig);
  const client = await pool.connect();

  try {
    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS member_war_roles (
        uuid VARCHAR(36) NOT NULL,
        role VARCHAR(16) NOT NULL CHECK (role IN ('DPS', 'HEALER', 'TANK')),
        synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (uuid, role)
      )
    `);

    // Get discord_links mapping
    const linksResult = await client.query('SELECT uuid, discord_id FROM discord_links');
    const discordToUuid = new Map();
    for (const row of linksResult.rows) {
      discordToUuid.set(row.discord_id, row.uuid);
    }
    console.log(`  discord_links entries: ${discordToUuid.size}`);

    // 4. Build insert rows
    const rows = [];
    let unlinked = 0;
    for (const [discordId, roleSet] of memberRoles) {
      const uuid = discordToUuid.get(discordId);
      if (!uuid) {
        unlinked++;
        continue;
      }
      for (const role of roleSet) {
        rows.push({ uuid, role });
      }
    }

    if (unlinked > 0) {
      console.log(`  ⚠ ${unlinked} members with war roles have no discord_links entry (skipped)`);
    }

    if (rows.length === 0) {
      console.log('  No rows to insert.');
      return;
    }

    // 5. Clear existing and insert fresh
    await client.query('BEGIN');
    await client.query('DELETE FROM member_war_roles');

    const insertQuery = `
      INSERT INTO member_war_roles (uuid, role)
      VALUES ($1, $2)
      ON CONFLICT (uuid, role) DO NOTHING
    `;
    for (const row of rows) {
      await client.query(insertQuery, [row.uuid, row.role]);
    }
    await client.query('COMMIT');

    console.log(`  Inserted ${rows.length} role assignments.`);

    // Summary
    const counts = { DPS: 0, HEALER: 0, TANK: 0 };
    for (const row of rows) counts[row.role]++;
    console.log(`  DPS: ${counts.DPS} | Healer: ${counts.HEALER} | Tank: ${counts.TANK}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetIdx = args.indexOf('--target');
  const target = targetIdx !== -1 ? args[targetIdx + 1] : null;

  if (!target || !['test', 'prod', 'both'].includes(target)) {
    console.error('Usage: node scripts/populate_war_roles.cjs --target test|prod|both');
    process.exit(1);
  }

  const targets = target === 'both' ? ['test', 'prod'] : [target];

  for (const t of targets) {
    await populateTarget(t);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
