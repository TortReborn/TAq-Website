import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestBounds } from '@/lib/test-history-data';
import { getExchangeBounds } from '@/lib/exchange-data';

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
    // Get bounds from snapshot table
    const snapshotResult = await pool.query(`
      SELECT
        (SELECT snapshot_time FROM territory_snapshots ORDER BY snapshot_time ASC LIMIT 1) as earliest,
        (SELECT snapshot_time FROM territory_snapshots ORDER BY snapshot_time DESC LIMIT 1) as latest
    `);

    const snapRow = snapshotResult.rows[0];
    const snapEarliest = snapRow?.earliest ? new Date(snapRow.earliest) : null;
    const snapLatest = snapRow?.latest ? new Date(snapRow.latest) : null;

    // Get bounds from territory exchange data
    const exchangeBounds = await getExchangeBounds(pool);

    // Merge bounds from all sources
    const candidates: Date[] = [];
    if (snapEarliest) candidates.push(snapEarliest);
    if (exchangeBounds?.earliest) candidates.push(exchangeBounds.earliest);
    const earliest = candidates.length > 0
      ? new Date(Math.min(...candidates.map(d => d.getTime())))
      : null;

    const lateCandidates: Date[] = [];
    if (snapLatest) lateCandidates.push(snapLatest);
    if (exchangeBounds?.latest) lateCandidates.push(exchangeBounds.latest);
    const latest = lateCandidates.length > 0
      ? new Date(Math.max(...lateCandidates.map(d => d.getTime())))
      : null;

    if (!earliest || !latest) {
      return NextResponse.json(
        { error: 'No history data available' },
        { status: 404 }
      );
    }

    // Detect gaps between data sources
    // A gap exists when exchange data ends before snapshot data begins
    const gaps: Array<{ start: string; end: string }> = [];
    if (exchangeBounds?.latest && snapEarliest) {
      const gapStart = exchangeBounds.latest;
      const gapEnd = snapEarliest;
      // Only report as a gap if there's meaningful empty space (>1 day)
      if (gapEnd.getTime() - gapStart.getTime() > 24 * 60 * 60 * 1000) {
        gaps.push({
          start: gapStart.toISOString(),
          end: gapEnd.toISOString(),
        });
      }
    }

    return NextResponse.json({
      earliest: earliest.toISOString(),
      latest: latest.toISOString(),
      gaps,
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
