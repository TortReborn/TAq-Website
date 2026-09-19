import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { getPool } from '@/lib/db';
import { rateLimitDisabled } from '@/lib/rate-limit';

/**
 * A rate limiter that every serverless instance agrees on.
 *
 * lib/rate-limit.ts counts in a module-level Map, so on Vercel each instance
 * has its own bucket and a caller who spreads requests across instances is
 * never limited. That is fine as a cheap first filter, but not as the only
 * guard on a public endpoint that writes to the database. This one keeps a
 * fixed-window counter in Postgres (rate_limit_buckets) instead: one upsert
 * per request, atomic, shared.
 *
 * Fixed windows are deliberate — simple, one row per client per window, and
 * a burst of at most 2× the limit at a window boundary is acceptable for
 * what this protects. Failure mode is open: if the database is unreachable
 * the caller's own write will fail anyway, and we would rather not turn a
 * DB blip into a 429 storm.
 */

const WINDOW_MS = 60 * 1000;

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  const pool = getPool();
  // Resolve through the search path first so an existing table (including a
  // session TEMP table in tests) is used rather than shadowed by a new one.
  const existing = await pool.query<{ oid: string | null }>(`SELECT to_regclass('rate_limit_buckets')::text AS oid`);
  if (existing.rows[0]?.oid) {
    tableReady = true;
    return;
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_buckets (
      bucket_key    VARCHAR(80)  NOT NULL,
      window_start  TIMESTAMPTZ  NOT NULL,
      count         INTEGER      NOT NULL DEFAULT 1,
      PRIMARY KEY (bucket_key, window_start)
    );
    CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON rate_limit_buckets (window_start);
  `);
  tableReady = true;
}

/** The client's IP as the platform reports it. */
export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Bucket key for a client + scope. The IP is hashed with the session secret
 * as salt so the table never holds raw addresses — the cache-status
 * endpoints removed in TAQ-92 leaked exactly that, and there is no reason
 * for this table to be able to.
 */
function bucketKey(scope: string, client: string): string {
  const salt = process.env.EXEC_SESSION_SECRET || process.env.COOKIE_SECRET || '';
  const digest = createHash('sha256').update(`${salt}:${client}`).digest('base64url').slice(0, 32);
  return `${scope}:${digest}`;
}

export type SharedRateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  /** Epoch ms when the current window ends. */
  resetTime: number;
};

/**
 * Count this request against `scope` for `client` and say whether it is
 * within `limit` per minute. Counts and checks in one statement so two
 * instances can't both see "39" and both allow.
 */
export async function consumeSharedRateLimit(
  scope: string,
  client: string,
  limit: number,
): Promise<SharedRateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const resetTime = windowStartMs + WINDOW_MS;

  if (rateLimitDisabled()) {
    return { allowed: true, count: 0, limit, resetTime };
  }

  try {
    await ensureTable();
    const pool = getPool();
    const result = await pool.query<{ count: number }>(
      `INSERT INTO rate_limit_buckets (bucket_key, window_start, count)
       VALUES ($1, to_timestamp($2 / 1000.0), 1)
       ON CONFLICT (bucket_key, window_start)
       DO UPDATE SET count = rate_limit_buckets.count + 1
       RETURNING count`,
      [bucketKey(scope, client), windowStartMs],
    );
    const count = Number(result.rows[0]?.count ?? 1);

    // Sweep expired windows now and then; cheap, indexed, and keeps the
    // table from growing without a scheduled job.
    if (count === 1 && Math.random() < 0.02) {
      pool.query(
        `DELETE FROM rate_limit_buckets WHERE window_start < to_timestamp($1 / 1000.0)`,
        [windowStartMs - WINDOW_MS],
      ).catch(() => {});
    }

    return { allowed: count <= limit, count, limit, resetTime };
  } catch (error) {
    console.error('[shared-rate-limit] falling open:', error);
    return { allowed: true, count: 0, limit, resetTime };
  }
}
