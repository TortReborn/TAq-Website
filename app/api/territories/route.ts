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
    const rowTimestamp = await simpleDatabaseCache.getTerritoriesTimestamp();
    const etag = rowTimestamp ? `"terr-${rowTimestamp.getTime()}"` : null;
    const cacheHeaders = {
      'Cache-Control': 'public, max-age=30, s-maxage=30', // 30 seconds client cache
      ...(etag ? { ETag: etag } : {}),
    };
    if (etag && request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders });
    }

    // Get territories from database cache only (managed by external bot)
    const territories = await simpleDatabaseCache.getTerritories(clientIP);

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
