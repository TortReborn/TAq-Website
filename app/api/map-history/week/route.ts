import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestSnapshotsInRange } from '@/lib/test-history-data';

export const dynamic = 'force-dynamic';

// 3.5 days in milliseconds (half a week)
const HALF_WEEK_MS = 3.5 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const centerParam = searchParams.get('center');

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

  const startDate = new Date(centerDate.getTime() - HALF_WEEK_MS);
  const endDate = new Date(centerDate.getTime() + HALF_WEEK_MS);

  // Use test data if enabled
  if (USE_TEST_DATA) {
    const snapshots = getTestSnapshotsInRange(centerDate, HALF_WEEK_MS * 2);
    return NextResponse.json({
      center: centerDate.toISOString(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      count: snapshots.length,
      snapshots,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60',
      },
    });
  }

  const pool = getPool();

  try {
    // Fetch all snapshots within the week range
    const result = await pool.query(`
      SELECT snapshot_time, territories
      FROM territory_snapshots
      WHERE snapshot_time >= $1 AND snapshot_time <= $2
      ORDER BY snapshot_time ASC
    `, [startDate.toISOString(), endDate.toISOString()]);

    const snapshots = result.rows.map(row => ({
      timestamp: row.snapshot_time.toISOString(),
      territories: row.territories,
    }));

    return NextResponse.json({
      center: centerDate.toISOString(),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      count: snapshots.length,
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
