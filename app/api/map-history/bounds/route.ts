import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestBounds } from '@/lib/test-history-data';
import { getExchangeBounds, getExchangeGaps, getInitialOwners } from '@/lib/exchange-data';
import { createTiming } from '@/lib/server-timing';

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
  const timing = createTiming('map-history/bounds');

  try {
    const [exchangeBounds, gaps, initialOwners] = await Promise.all([
      timing.span('bounds', () => getExchangeBounds(pool)),
      timing.span('gaps', () => getExchangeGaps(pool)),
      timing.span('initialOwners', () => getInitialOwners(pool)),
    ]);
    timing.log({ gaps: gaps.length, initialOwners: initialOwners.length });

    if (!exchangeBounds) {
      return NextResponse.json(
        { error: 'No history data available' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      earliest: exchangeBounds.earliest.toISOString(),
      latest: exchangeBounds.latest.toISOString(),
      gaps: gaps.map(g => ({
        start: g.start.toISOString(),
        end: g.end.toISOString(),
      })),
      initialOwners: initialOwners.map(o => ({
        territory: o.territory,
        guild: o.guild,
      })),
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
