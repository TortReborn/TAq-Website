import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestBounds } from '@/lib/test-history-data';
import { getExchangeBounds, getExchangeGaps, getInitialOwners } from '@/lib/exchange-data';
import { createTiming } from '@/lib/server-timing';

export const dynamic = 'force-dynamic';

// gaps + initialOwners are the expensive part of this route (a whole-table
// gap scan plus ~750 lateral probes, seconds on a cold instance) and they
// change at most when a new recording gap appears. They're cached in the
// cache_entries table so only one request per TTL pays the computation —
// every other request (including every cold lambda) does a single-row read.
// earliest/latest stay fresh: MIN/MAX on an indexed column is cheap.
// v2: gaps now exclude known war-outage windows (lib/war-outages.ts)
const META_KEY = 'map-history-bounds-meta-v2';
const META_TTL_MS = 6 * 60 * 60 * 1000;

interface BoundsMeta {
  gaps: Array<{ start: string; end: string }>;
  initialOwners: Array<{ territory: string; guild: string }>;
}

async function getBoundsMeta(pool: Pool, timing: ReturnType<typeof createTiming>): Promise<BoundsMeta> {
  const cached = await timing.span('metaRead', () => pool.query(
    `SELECT data, created_at FROM cache_entries WHERE cache_key = $1`,
    [META_KEY],
  ));
  if (
    cached.rows.length > 0 &&
    Date.now() - new Date(cached.rows[0].created_at).getTime() < META_TTL_MS
  ) {
    return cached.rows[0].data as BoundsMeta;
  }

  const [gaps, initialOwners] = await Promise.all([
    timing.span('gaps', () => getExchangeGaps(pool)),
    timing.span('initialOwners', () => getInitialOwners(pool)),
  ]);
  const meta: BoundsMeta = {
    gaps: gaps.map(g => ({ start: g.start.toISOString(), end: g.end.toISOString() })),
    initialOwners: initialOwners.map(o => ({ territory: o.territory, guild: o.guild })),
  };

  try {
    await pool.query(
      `INSERT INTO cache_entries (cache_key, data, created_at, expires_at)
       VALUES ($1, $2, NOW(), NOW() + interval '6 hours')
       ON CONFLICT (cache_key)
       DO UPDATE SET data = $2, created_at = NOW(), expires_at = NOW() + interval '6 hours'`,
      [META_KEY, JSON.stringify(meta)],
    );
  } catch (error) {
    // Cache write failure is non-fatal — the response is still correct
    console.warn('[api:map-history/bounds] failed to cache bounds meta:', error);
  }
  return meta;
}

export async function GET(request: NextRequest) {
  // Use test data if enabled
  if (USE_TEST_DATA) {
    const bounds = getTestBounds();
    return NextResponse.json(bounds, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }

  const pool = getPool();
  const timing = createTiming('map-history/bounds');

  try {
    const [exchangeBounds, meta] = await Promise.all([
      timing.span('bounds', () => getExchangeBounds(pool)),
      getBoundsMeta(pool, timing),
    ]);
    timing.log({ gaps: meta.gaps.length, initialOwners: meta.initialOwners.length });

    if (!exchangeBounds) {
      return NextResponse.json(
        { error: 'No history data available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      earliest: exchangeBounds.earliest.toISOString(),
      latest: exchangeBounds.latest.toISOString(),
      gaps: meta.gaps,
      initialOwners: meta.initialOwners,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minute cache
        ...timing.header(),
      },
    });
  } catch (error) {
    console.error('Error fetching history bounds:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history bounds' },
      { status: 500 }
    );
  }
}
