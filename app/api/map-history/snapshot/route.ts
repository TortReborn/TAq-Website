import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestSnapshots } from '@/lib/test-history-data';
import { reconstructSingleSnapshot } from '@/lib/exchange-data';
import { createTiming } from '@/lib/server-timing';
import { isReconstructed, reconstructAt } from '@/lib/reconstruction';
import verboseJson from '@/public/territories_verbose.json';

// Territory geometry, used to order reconstructed changes spatially so this
// endpoint agrees with what the map draws.
const VERBOSE = verboseJson as unknown as Record<
  string,
  { Location: { start: [number, number]; end: [number, number] } }
>;

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

  // Before the exchange log begins there is nothing to look up. Serve the
  // reconstruction, flagged so no caller mistakes it for recorded data.
  if (isReconstructed(targetDate)) {
    const rec = reconstructAt(targetDate, VERBOSE);
    if (rec) {
      return NextResponse.json({
        timestamp: targetDate.toISOString(),
        territories: rec.territories,
        requestedTimestamp: targetDate.toISOString(),
        timeDiffSeconds: 0,
        synthetic: true,
        anchor: rec.anchor,
        provenance: { guessed: rec.provenance[0], inferred: rec.provenance[1], attested: rec.provenance[2] },
      }, {
        headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
      });
    }
  }

  const pool = getPool();
  const timing = createTiming('map-history/snapshot');

  try {
    const exchangeSnapshot = await timing.span('reconstruct', () => reconstructSingleSnapshot(pool, targetDate));
    timing.log({ timestamp: targetDate.toISOString(), found: !!exchangeSnapshot });

    if (exchangeSnapshot) {
      return NextResponse.json({
        timestamp: exchangeSnapshot.timestamp,
        territories: exchangeSnapshot.territories,
        requestedTimestamp: targetDate.toISOString(),
        timeDiffSeconds: 0,
      }, {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
          ...timing.header(),
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
