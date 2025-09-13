import { NextRequest, NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get territories from database cache only (managed by external bot)
    const territories = await simpleDatabaseCache.getTerritories(clientIP);
    
    if (territories) {
      return NextResponse.json(territories, {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=30', // 30 seconds client cache
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
