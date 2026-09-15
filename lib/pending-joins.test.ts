import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { countPendingJoins } from './pending-joins';

// Integration test against the local test database (same instance
// scripts/_check_test_db.cjs targets, overridable via TEST_DB_* env vars).
// All data lives in session-scoped TEMP tables, which shadow the real
// applications/discord_links/membership_stints tables for unqualified names —
// nothing in the test database is touched. Skipped when the database is
// unreachable.
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

const UUID_A = '11111111-1111-1111-1111-111111111111';
const UUID_B = '22222222-2222-2222-2222-222222222222';
const UUID_C = '33333333-3333-3333-3333-333333333333';

describe.skipIf(!available)('countPendingJoins', () => {
  let pool: Pool;
  let nextId = 1;

  async function insertApp(discordId: string, status: string, type = 'guild', submittedAt = '2026-06-01') {
    await pool.query(
      `INSERT INTO applications (id, application_type, discord_id, status, submitted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [nextId++, type, discordId, status, submittedAt]
    );
  }

  async function insertLink(discordId: string, uuid: string) {
    await pool.query(
      `INSERT INTO discord_links (discord_id, uuid) VALUES ($1, $2::uuid)`,
      [discordId, uuid]
    );
  }

  async function stint(uuid: string, joinedAt: string, leftAt: string | null = null) {
    await pool.query(`INSERT INTO membership_stints (uuid, joined_at, left_at) VALUES ($1::uuid, $2, $3)`, [uuid, joinedAt, leftAt]);
  }

  beforeAll(async () => {
    pool = new Pool(config);
    await pool.query(`
      CREATE TEMP TABLE applications (
        id INT PRIMARY KEY,
        application_type VARCHAR(20) NOT NULL,
        discord_id VARCHAR(30) NOT NULL,
        status VARCHAR(20) NOT NULL,
        submitted_at TIMESTAMPTZ,
        reviewed_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TEMP TABLE discord_links (
        discord_id BIGINT PRIMARY KEY,
        uuid UUID NOT NULL UNIQUE
      )
    `);
    await pool.query(`
      CREATE TEMP TABLE membership_stints (
        id SERIAL PRIMARY KEY,
        uuid UUID NOT NULL,
        joined_at TIMESTAMPTZ NOT NULL,
        left_at TIMESTAMPTZ
      )
    `);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE applications, discord_links, membership_stints');
    nextId = 1;
  });

  it('counts an accepted guild applicant who is linked but has no stint', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', UUID_A);
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('counts an accepted guild applicant with no discord_links row at all', async () => {
    await insertApp('100', 'accepted');
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('excludes applicants who joined (stint opened after applying)', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', UUID_A);
    await stint(UUID_A, '2026-06-03');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('still excludes them after they leave again — joined is sticky', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', UUID_A);
    await stint(UUID_A, '2026-06-03', '2026-08-01');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('excludes a player who joined in-game just before applying', async () => {
    await insertApp('100', 'accepted', 'guild', '2026-06-01');
    await insertLink('100', UUID_A);
    await stint(UUID_A, '2026-05-29');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('excludes a current member who applied again (open stint predates the application)', async () => {
    await insertApp('100', 'accepted', 'guild', '2026-06-01');
    await insertLink('100', UUID_A);
    await stint(UUID_A, '2025-01-01');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('counts a returning applicant whose only stint predates the application', async () => {
    await insertApp('100', 'accepted', 'guild', '2026-06-01');
    await insertLink('100', UUID_A);
    await stint(UUID_A, '2025-01-01', '2025-03-01');
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('does not count a stint that belongs to someone else', async () => {
    await insertApp('100', 'accepted');
    await insertLink('100', UUID_A);
    await insertLink('200', UUID_B);
    await stint(UUID_B, '2026-06-03');
    expect(await countPendingJoins(pool)).toBe(1);
  });

  it('excludes expired applications (ticket closed, never joined)', async () => {
    await insertApp('100', 'expired');
    await insertLink('100', UUID_A);
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('excludes non-guild and non-accepted applications', async () => {
    await insertApp('100', 'accepted', 'community');
    await insertApp('200', 'denied');
    await insertApp('300', 'pending');
    expect(await countPendingJoins(pool)).toBe(0);
  });

  it('counts each distinct pending applicant', async () => {
    await insertApp('100', 'accepted'); // genuine pending, linked, no stint
    await insertLink('100', UUID_A);
    await insertApp('200', 'accepted'); // joined
    await insertLink('200', UUID_B);
    await stint(UUID_B, '2026-06-03');
    await insertApp('300', 'expired'); // retired
    await insertLink('300', UUID_C);
    await insertApp('400', 'accepted'); // pending, no link row yet
    expect(await countPendingJoins(pool)).toBe(2);
  });
});
