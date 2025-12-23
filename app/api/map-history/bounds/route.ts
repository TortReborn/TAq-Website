import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestBounds } from '@/lib/test-history-data';

export const dynamic = 'force-dynamic';

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

  try {
    // Get earliest and latest snapshot timestamps
    const result = await pool.query(`
      SELECT
        (SELECT snapshot_time FROM territory_snapshots ORDER BY snapshot_time ASC LIMIT 1) as earliest,
        (SELECT snapshot_time FROM territory_snapshots ORDER BY snapshot_time DESC LIMIT 1) as latest
    `);

    const row = result.rows[0];

    if (!row?.earliest || !row?.latest) {
      return NextResponse.json(
        { error: 'No history data available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      earliest: row.earliest.toISOString(),
      latest: row.latest.toISOString(),
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300', // 5 minute cache
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
