import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestSnapshots } from '@/lib/test-history-data';
import { reconstructSingleSnapshot } from '@/lib/exchange-data';

export const dynamic = 'force-dynamic';

// If the nearest snapshot is more than 1 day away, also check file data
const SNAPSHOT_FALLBACK_THRESHOLD_SEC = 24 * 60 * 60;

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
    const result = await pool.query(`
      SELECT snapshot_time, territories,
             ABS(EXTRACT(EPOCH FROM (snapshot_time - $1::timestamptz))) as time_diff
      FROM territory_snapshots
      ORDER BY time_diff ASC
      LIMIT 1
    `, [targetDate.toISOString()]);

    const snapRow = result.rows[0];
    const snapDiff = snapRow ? Math.round(snapRow.time_diff) : Infinity;

    // If snapshot is close enough, return it directly
    if (snapRow && snapDiff <= SNAPSHOT_FALLBACK_THRESHOLD_SEC) {
      return NextResponse.json({
        timestamp: snapRow.snapshot_time.toISOString(),
        territories: snapRow.territories,
        requestedTimestamp: targetDate.toISOString(),
        timeDiffSeconds: snapDiff,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    }

    // Snapshot too far away or missing — reconstruct from exchange data
    const exchangeSnapshot = await reconstructSingleSnapshot(pool, targetDate);

    if (exchangeSnapshot) {
      return NextResponse.json({
        timestamp: exchangeSnapshot.timestamp,
        territories: exchangeSnapshot.territories,
        requestedTimestamp: targetDate.toISOString(),
        timeDiffSeconds: 0, // Reconstructed at exact requested time
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    }

    // Fall back to the distant snapshot if we have one
    if (snapRow) {
      return NextResponse.json({
        timestamp: snapRow.snapshot_time.toISOString(),
        territories: snapRow.territories,
        requestedTimestamp: targetDate.toISOString(),
        timeDiffSeconds: snapDiff,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      });
    }

    return NextResponse.json(
      { error: 'No snapshot found near that timestamp' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching history snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history snapshot' },
      { status: 500 }
    );
  }
}
