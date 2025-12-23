import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestSnapshots } from '@/lib/test-history-data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const timestampParam = searchParams.get('timestamp');

  if (!timestampParam) {
    return NextResponse.json(
      { error: 'Missing timestamp parameter' },
      { status: 400 }
    );
  }

  const targetDate = new Date(timestampParam);
  if (isNaN(targetDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid timestamp' },
      { status: 400 }
    );
  }

  // Use test data if enabled
  if (USE_TEST_DATA) {
    const snapshots = getTestSnapshots();
    let nearest = snapshots[0];
    let nearestDiff = Math.abs(new Date(nearest.timestamp).getTime() - targetDate.getTime());

    for (const snapshot of snapshots) {
      const diff = Math.abs(new Date(snapshot.timestamp).getTime() - targetDate.getTime());
      if (diff < nearestDiff) {
        nearestDiff = diff;
        nearest = snapshot;
      }
    }

    return NextResponse.json({
      timestamp: nearest.timestamp,
      territories: nearest.territories,
      requestedTimestamp: targetDate.toISOString(),
      timeDiffSeconds: Math.round(nearestDiff / 1000),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }

  const pool = getPool();

  try {
    // Find the nearest snapshot to the requested timestamp
    // First try exact match, then find the closest one
    const result = await pool.query(`
      SELECT snapshot_time, territories,
             ABS(EXTRACT(EPOCH FROM (snapshot_time - $1::timestamptz))) as time_diff
      FROM territory_snapshots
      ORDER BY time_diff ASC
      LIMIT 1
    `, [targetDate.toISOString()]);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'No snapshot found near that timestamp' },
        { status: 404 }
      );
    }

    const row = result.rows[0];

    return NextResponse.json({
      timestamp: row.snapshot_time.toISOString(),
      territories: row.territories,
      requestedTimestamp: targetDate.toISOString(),
      timeDiffSeconds: Math.round(row.time_diff),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minute cache
      },
    });
  } catch (error) {
    console.error('Error fetching history snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history snapshot' },
      { status: 500 }
    );
  }
}
