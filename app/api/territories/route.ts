import { NextResponse } from 'next/server';
import dbCache from '@/lib/db-cache';

export async function GET() {
  try {
    // Get territories from PostgreSQL cache (auto-refreshes if stale)
    const territories = await dbCache.getTerritories();
    
    if (territories) {
      return NextResponse.json(territories, {
        headers: {
          'Cache-Control': 'public, max-age=10, s-maxage=10',
          'X-Cache': 'HIT',
          'X-Cache-Source': 'PostgreSQL',
          'X-Cache-Timestamp': Date.now().toString()
        },
      });
    }

    // If cache returns null, return error
    return NextResponse.json(
      { error: 'Territory data temporarily unavailable' },
      { 
        status: 503,
        headers: {
          'X-Cache': 'MISS',
          'X-Cache-Source': 'PostgreSQL',
          'Retry-After': '10'
        }
      }
    );
  } catch (error) {
    console.error('Error in territories API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch territory data' },
      { status: 500 }
    );
  }
}
