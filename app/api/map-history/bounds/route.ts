import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestBounds } from '@/lib/test-history-data';
import { getExchangeBounds, getExchangeGaps } from '@/lib/exchange-data';

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
    const exchangeBounds = await getExchangeBounds(pool);

    if (!exchangeBounds) {
      return NextResponse.json(
        { error: 'No history data available' },
        { status: 404 }
      );
    }

    const gaps = await getExchangeGaps(pool);

    return NextResponse.json({
      earliest: exchangeBounds.earliest.toISOString(),
      latest: exchangeBounds.latest.toISOString(),
      gaps: gaps.map(g => ({
        start: g.start.toISOString(),
        end: g.end.toISOString(),
      })),
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
