import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';

// Integration test against the local test database, same scaffold as
// pending-joins.test.ts: the counter table is a session TEMP table that
// shadows the real one, so nothing in the database is touched. The module
// resolves the table name through the search path before creating it, which
// is what makes the temp table win. Skipped when the database is unreachable.

const config = {
  user: process.env.DB_LOGIN || 'tortuser',
  password: process.env.DB_PASS || 'UserPass123',
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_DATABASE || 'tortreborn',
  ssl: undefined,
  // One connection so every query sees the same temp table.
  max: 1,
  connectionTimeoutMillis: 3000,
};

let pool: Pool | null = null;
async function probeDatabase(): Promise<boolean> {
  const probe = new Pool(config);
  try {
    await probe.query('SELECT 1');
    pool = probe;
    return true;
  } catch {
    await probe.end().catch(() => {});
    return false;
  }
}
const available = await probeDatabase();

vi.mock('@/lib/db', () => ({ getPool: () => pool }));
// The module short-circuits under RATE_LIMIT_DISABLED (like lib/rate-limit.ts);
// the test wants the real path.
vi.stubEnv('RATE_LIMIT_DISABLED', '');
vi.stubEnv('EXEC_SESSION_SECRET', 'test-salt');

const { consumeSharedRateLimit, clientIp } = await import('./shared-rate-limit');

describe.skipIf(!available)('consumeSharedRateLimit', () => {
  beforeAll(async () => {
    await pool!.query(`
      CREATE TEMP TABLE rate_limit_buckets (
        bucket_key    VARCHAR(80)  NOT NULL,
        window_start  TIMESTAMPTZ  NOT NULL,
        count         INTEGER      NOT NULL DEFAULT 1,
        PRIMARY KEY (bucket_key, window_start)
      )`);
  });
  afterAll(async () => {
    await pool?.end().catch(() => {});
  });

  it('counts across calls and refuses once the limit is passed', async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await consumeSharedRateLimit('t-limit', '203.0.113.7', 3));
    expect(results.map(r => r.count)).toEqual([1, 2, 3, 4, 5]);
    expect(results.map(r => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it('keeps clients and scopes in separate buckets', async () => {
    await consumeSharedRateLimit('t-scope', 'client-a', 1);
    const other = await consumeSharedRateLimit('t-scope', 'client-b', 1);
    const otherScope = await consumeSharedRateLimit('t-scope-2', 'client-a', 1);
    expect(other).toMatchObject({ allowed: true, count: 1 });
    expect(otherScope).toMatchObject({ allowed: true, count: 1 });
  });

  it('never stores the raw client identifier', async () => {
    await consumeSharedRateLimit('t-hash', '198.51.100.42', 10);
    const rows = await pool!.query(`SELECT bucket_key FROM rate_limit_buckets WHERE bucket_key LIKE 't-hash:%'`);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].bucket_key).not.toContain('198.51.100.42');
  });

  it('reports the end of the current minute window', async () => {
    const before = Date.now();
    const r = await consumeSharedRateLimit('t-window', 'x', 10);
    expect(r.resetTime).toBeGreaterThan(before);
    expect(r.resetTime - before).toBeLessThanOrEqual(60_000);
    expect(r.resetTime % 60_000).toBe(0);
  });
});

describe('clientIp', () => {
  const req = (headers: Record<string, string>) =>
    ({ headers: new Headers(headers) }) as unknown as import('next/server').NextRequest;

  it('takes the first x-forwarded-for hop, then x-real-ip, then unknown', () => {
    expect(clientIp(req({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }))).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-real-ip': '198.51.100.9' }))).toBe('198.51.100.9');
    expect(clientIp(req({}))).toBe('unknown');
  });
});
