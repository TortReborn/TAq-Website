import { NextRequest, NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

    // ETag revalidation: the payload only changes when the bot rewrites the
    // cache row, so its timestamp identifies the content. A 30s poll whose
    // data hasn't changed costs one timestamp read + an empty 304 instead of
    // transferring ~300KB of JSON.
    //
    // First-time requests (no If-None-Match) can't 304, so the timestamp and
    // payload reads run in parallel — sequential round-trips to the remote DB
    // doubled first-load latency. Revalidations keep the cheap
    // timestamp-first order.
    const ifNoneMatch = request.headers.get('if-none-match');
    let rowTimestamp: Date | null;
    let territories: unknown | undefined;
    if (ifNoneMatch) {
      rowTimestamp = await simpleDatabaseCache.getTerritoriesTimestamp();
    } else {
      [rowTimestamp, territories] = await Promise.all([
        simpleDatabaseCache.getTerritoriesTimestamp(),
        simpleDatabaseCache.getTerritories(clientIP),
      ]);
    }
    const etag = rowTimestamp ? `"terr-${rowTimestamp.getTime()}"` : null;
    const cacheHeaders = {
      'Cache-Control': 'public, max-age=30, s-maxage=30', // 30 seconds client cache
      ...(etag ? { ETag: etag } : {}),
    };
    if (etag && ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    // Get territories from database cache only (managed by external bot)
    if (territories === undefined) {
      territories = await simpleDatabaseCache.getTerritories(clientIP);
    }

    if (territories) {
      return NextResponse.json(territories, {
        headers: {
          ...cacheHeaders,
          'X-Cache': 'HIT',
          'X-Cache-Source': 'PostgreSQL-Bot-Managed',
          'X-Cache-Timestamp': Date.now().toString()
        },
      });
    }

    // If cache returns null, return error (data managed by external bot)
    return NextResponse.json(
      { error: 'Territory data not available. External bot may be updating data.' },
      { 
        status: 503,
        headers: {
          'X-Cache': 'MISS',
          'X-Cache-Source': 'PostgreSQL-Bot-Managed',
          'Retry-After': '30'
        }
      }
    );
  } catch (error) {
    console.error('Error in territories API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch territory data from cache' },
      { status: 500 }
    );
  }
}
