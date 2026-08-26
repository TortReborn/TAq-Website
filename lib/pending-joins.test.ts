import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { countPendingJoins } from './pending-joins';

// Integration test against the local test database (same instance
// scripts/_check_test_db.cjs targets, overridable via TEST_DB_* env vars).
// All data lives in session-scoped TEMP tables, which shadow the real
// applications/discord_links tables for unqualified names — nothing in the
// test database is touched. Skipped when the database is unreachable.
const config = {
  user: process.env.TEST_DB_LOGIN || 'tortuser',
  password: process.env.TEST_DB_PASS || 'UserPass123',
  host: process.env.TEST_DB_HOST || '127.0.0.1',
  port: Number(process.env.TEST_DB_PORT) || 5432,
  database: process.env.TEST_DB_DATABASE || 'tortreborn',
  ssl: undefined,
  // One connection so every query sees the same temp tables.
  max: 1,
  connectionTimeoutMillis: 3000,
};

async function probeDatabase(): Promise<boolean> {
  const probe = new Pool(config);
  try {
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const available = await probeDatabase();

describe.skipIf(!available)('countPendingJoins', () => {
  let pool: Pool;
  let nextId = 1;

  async function insertApp(discordId: string, status: string, type = 'guild') {
    await pool.query(
      `INSERT INTO applications (id, application_type, discord_id, status)
       VALUES ($1, $2, $3, $4)`,
      [nextId++, type, discordId, status]
    );
  }

  async function insertLink(discordId: string, linked: boolean) {
    await pool.query(
      `INSERT INTO discord_links (discord_id, linked) VALUES ($1, $2)`,
      [discordId, linked]
    );
  }

  beforeAll(async () => {
    pool = new Pool(config);
    await pool.query(`
      CREATE TEMP TABLE applications (
        id INT PRIMARY KEY,
        application_type VARCHAR(20) NOT NULL,
        discord_id VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL
      )
    `);
    await pool.query(`
      CREATE TEMP TABLE discord_links (
        discord_id BIGINT NOT NULL,
        linked BOOLEAN NOT NULL
      )
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE applications, discord_links');
    nextId = 1;
  });

  it('counts an accepted guild applicant with no live link', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', false);
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('counts an accepted guild applicant with no discord_links row at all', async () => {
    await insertApp('100', 'accepted');
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('excludes applicants who joined (live linked row)', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', true);
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('excludes joined applicants who also carry a stale unlinked row', async () => {
    // The old JOIN-on-linked=FALSE query counted this player via the stale row.
    await insertApp('100', 'accepted');
    await insertLink('100', true);
    await insertLink('100', false);
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('counts an applicant once even with several unlinked rows', async () => {
    // The old JOIN query counted one application per unlinked row.
    await insertApp('100', 'accepted');
    await insertLink('100', false);
    await insertLink('100', false);
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('excludes expired applications (ticket closed, never joined)', async () => {
    await insertApp('100', 'expired');
    await insertLink('100', false);
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('excludes non-guild and non-accepted applications', async () => {
    await insertApp('100', 'accepted', 'community');
    await insertApp('200', 'denied');
    await insertApp('300', 'pending');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('counts each distinct pending applicant', async () => {
    await insertApp('100', 'accepted'); // genuine pending, unlinked row
    await insertLink('100', false);
    await insertApp('200', 'accepted'); // joined
    await insertLink('200', true);
    await insertApp('300', 'expired'); // retired
    await insertLink('300', false);
    await insertApp('400', 'accepted'); // pending, no link row yet
    expect(await countPendingJoins(pool)).toBe(2);
  });
});
