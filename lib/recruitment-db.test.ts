import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import {
  RecruitmentError, clockIn, clockOut, deleteSession, deleteShout, getLive, getMonth, logSession, logShout,
} from './recruitment-db';

// Integration test against the local test database. The tables are made from
// sql/create_recruitment_tables.sql itself, as session TEMP tables that shadow
// any real ones for unqualified names, so the constraints tested here are the
// ones that ship. Skipped when the database is unreachable.
const config = {
  // Credentials come from .env via vitest.config.ts; no literal fallback here.
  user: process.env.DB_LOGIN,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE || 'tortreborn',
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

const A = { id: '100', name: 'Alpha' };
const B = { id: '200', name: 'Bravo' };
const H = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * H);

async function refused(p: Promise<unknown>, status?: number): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(RecruitmentError);
    if (status) expect((e as RecruitmentError).status).toBe(status);
    return (e as Error).message;
  }
  throw new Error('expected a RecruitmentError');
}

describe.skipIf(!available)('recruitment-db', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool(config);
    const ddl = fs.readFileSync(path.resolve(__dirname, '../sql/create_recruitment_tables.sql'), 'utf8')
      .replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE');
    await pool.query(ddl);
    await pool.query(`CREATE TEMP TABLE audit_log (
      id SERIAL PRIMARY KEY, log_type VARCHAR(50) NOT NULL, actor_name VARCHAR(100), actor_id BIGINT,
      action TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
  });

  afterAll(async () => {
    await pool?.end();
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE recruitment_pfinder_sessions, recruitment_shouts, audit_log');
  });

  describe('pfinder sessions', () => {
    it('clocks in and out, and audits both', async () => {
      const start = ago(2);
      await clockIn(A, start, pool);
      expect((await getLive(pool)).open.map(s => s.ign)).toEqual(['Alpha']);
      const s = await clockOut(A, new Date(start.getTime() + H), pool);
      expect(Date.parse(s.ended_at!) - Date.parse(s.started_at)).toBe(H);
      expect((await getLive(pool)).open).toEqual([]);
      const { rows } = await pool.query(`SELECT log_type FROM audit_log`);
      expect(rows).toEqual([{ log_type: 'recruitment' }, { log_type: 'recruitment' }]);
    });

    it('refuses a second clock-in and a clock-out with nothing open', async () => {
      await clockIn(A, ago(1), pool);
      expect(await refused(clockIn(A, new Date(), pool))).toMatch(/already clocked in/);
      expect(await refused(clockOut(B, new Date(), pool))).toMatch(/not clocked in/);
    });

    it('lets two members be clocked in at once', async () => {
      await clockIn(A, ago(1), pool);
      await clockIn(B, ago(1), pool);
      expect((await getLive(pool)).open).toHaveLength(2);
    });

    it('refuses a clock-out before the clock-in or over the session limit', async () => {
      await clockIn(A, ago(23), pool);
      expect(await refused(clockOut(A, ago(24), pool), 400)).toMatch(/after you clocked in/);
      await pool.query(`UPDATE recruitment_pfinder_sessions SET started_at = NOW() - interval '30 hours'`);
      expect(await refused(clockOut(A, new Date(), pool), 400)).toMatch(/over 24 hours/);
      await clockOut(A, ago(10), pool);
    });

    it('refuses times in the future', async () => {
      expect(await refused(clockIn(A, new Date(Date.now() + H), pool), 400)).toMatch(/future/);
    });

    it('logs a past session but not one overlapping your own', async () => {
      await logSession(A, ago(5), ago(3), pool);
      expect(await refused(logSession(A, ago(4), ago(2), pool))).toMatch(/overlaps/);
      expect(await refused(clockIn(A, ago(4), pool))).toMatch(/overlaps/);
      // someone else's time never clashes
      await logSession(B, ago(4), ago(2), pool);
      // back to back is fine
      await logSession(A, ago(3), ago(2), pool);
    });

    it('refuses a past session over the limit or ending before it starts', async () => {
      expect(await refused(logSession(A, ago(30), ago(2), pool), 400)).toMatch(/at most 24/);
      expect(await refused(logSession(A, ago(2), ago(3), pool), 400)).toMatch(/after the start/);
    });

    it('lets you delete your own session, and only a manager delete others', async () => {
      const s = await logSession(A, ago(3), ago(2), pool);
      expect(await refused(deleteSession(s.id, B, false, pool), 403)).toMatch(/your own/);
      await deleteSession(s.id, B, true, pool);
      expect(await refused(deleteSession(s.id, A, false, pool), 404)).toMatch(/gone/);
    });

    it('returns sessions overlapping a month, open ones included', async () => {
      await pool.query(`INSERT INTO recruitment_pfinder_sessions (discord_id, ign, started_at, ended_at) VALUES
        (100, 'Alpha', '2026-10-31T23:00Z', '2026-11-01T01:00Z'),
        (100, 'Alpha', '2026-10-30T10:00Z', '2026-10-30T11:00Z'),
        (200, 'Bravo', '2026-11-20T10:00Z', NULL)`);
      const { sessions } = await getMonth('2026-11', pool);
      expect(sessions.map(s => s.started_at)).toEqual(['2026-10-31T23:00:00.000Z', '2026-11-20T10:00:00.000Z']);
    });
  });

  describe('shouts', () => {
    it('allows three a UTC day for the whole guild, then refuses', async () => {
      const day = new Date('2026-10-01T00:00Z').getTime();
      await logShout(A, new Date(day + 1 * H), null, pool);
      await logShout(B, new Date(day + 2 * H), 'world 12', pool);
      await logShout(A, new Date(day + 23 * H), null, pool);
      expect(await refused(logShout(B, new Date(day + 23.5 * H), null, pool))).toMatch(/All 3 shouts for 2026-10-01/);
      // the next UTC day starts fresh
      await logShout(B, new Date(day + 24 * H), null, pool);
      const { shouts } = await getMonth('2026-10', pool);
      expect(shouts.map(s => s.slot)).toEqual([1, 2, 3, 1]);
      expect(shouts[1].note).toBe('world 12');
    });

    it('frees a slot when a shout is deleted', async () => {
      const day = new Date('2026-10-01T00:00Z').getTime();
      const first = await logShout(A, new Date(day + H), null, pool);
      await logShout(A, new Date(day + 2 * H), null, pool);
      await logShout(A, new Date(day + 3 * H), null, pool);
      expect(await refused(deleteShout(first.id, B, false, pool), 403)).toMatch(/you logged/);
      await deleteShout(first.id, A, false, pool);
      expect((await logShout(B, new Date(day + 4 * H), null, pool)).slot).toBe(1);
    });

    it("counts today's shouts in UTC", async () => {
      await logShout(A, new Date(), null, pool);
      await logShout(A, ago(48), null, pool);
      expect((await getLive(pool)).today).toHaveLength(1);
    });
  });
});
