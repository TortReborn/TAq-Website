import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestSnapshotsInRange } from '@/lib/test-history-data';
import { reconstructSnapshotsFromExchanges } from '@/lib/exchange-data';

export const dynamic = 'force-dynamic';

// 3.5 days in milliseconds (half a week)
const HALF_WEEK_MS = 3.5 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const centerParam = searchParams.get('center');
  const limitParam = searchParams.get('limit');
  const offsetParam = searchParams.get('offset');

  if (!centerParam) {
    return NextResponse.json(
      { error: 'Missing center timestamp parameter' },
      { status: 400 }
    );
  }

  const centerDate = new Date(centerParam);
  if (isNaN(centerDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid center timestamp' },
      { status: 400 }
    );
  }

  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 2000), 2000) : null;
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

  const startDate = new Date(centerDate.getTime() - HALF_WEEK_MS);
  const endDate = new Date(centerDate.getTime() + HALF_WEEK_MS);

  // Use test data if enabled
  if (USE_TEST_DATA) {
    const allSnapshots = getTestSnapshotsInRange(centerDate, HALF_WEEK_MS * 2);
    const total = allSnapshots.length;
    const snapshots = limit !== null
      ? allSnapshots.slice(offset, offset + limit)
      : allSnapshots;

    return NextResponse.json({
      center: centerDate.toISOString(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      total,
      offset,
      count: snapshots.length,
      hasMore: limit !== null && offset + snapshots.length < total,
      snapshots,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }

  const pool = getPool();

  try {
    // Try the snapshot table first
    const countResult = await pool.query(`
      SELECT COUNT(*)::int as total
      FROM territory_snapshots
      WHERE snapshot_time >= $1 AND snapshot_time <= $2
    `, [startDate.toISOString(), endDate.toISOString()]);

    let total = countResult.rows[0].total;
    let snapshots: Array<{ timestamp: string; territories: Record<string, unknown> }>;

    if (total > 0) {
      // Snapshot table has data for this range — use it
      let query = `
        SELECT snapshot_time, territories
        FROM territory_snapshots
        WHERE snapshot_time >= $1 AND snapshot_time <= $2
        ORDER BY snapshot_time ASC
      `;
      const params: (string | number)[] = [startDate.toISOString(), endDate.toISOString()];

      if (limit !== null) {
        query += ` LIMIT $3 OFFSET $4`;
        params.push(limit, offset);
      }

      const result = await pool.query(query, params);

      snapshots = result.rows.map(row => ({
        timestamp: row.snapshot_time.toISOString(),
        territories: row.territories,
      }));
    } else {
      // No snapshot data — reconstruct from exchange events
      const exchangeSnapshots = await reconstructSnapshotsFromExchanges(
        pool,
        startDate,
        endDate,
      );

      if (exchangeSnapshots.length > 0) {
        total = exchangeSnapshots.length;
        snapshots = limit !== null
          ? exchangeSnapshots.slice(offset, offset + limit)
          : exchangeSnapshots;
      } else {
        total = 0;
        snapshots = [];
      }
    }

    return NextResponse.json({
      center: centerDate.toISOString(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      total,
      offset,
      count: snapshots.length,
      hasMore: limit !== null && offset + snapshots.length < total,
      snapshots,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60', // 1 minute cache
      },
    });
  } catch (error) {
    console.error('Error fetching history week:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history week data' },
      { status: 500 }
    );
  }
}
