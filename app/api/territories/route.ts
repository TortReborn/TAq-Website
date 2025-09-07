import { NextResponse } from 'next/server';
import cache from '@/lib/cache';

export async function GET() {
  try {
    // Try to get territories from cache first
    const cachedTerritories = cache.getTerritories();
    
    if (cachedTerritories) {
      return NextResponse.json(cachedTerritories, {
        headers: {
          'Cache-Control': 'public, max-age=30, s-maxage=30',
          'X-Cache': 'HIT',
          'X-Cache-Timestamp': Date.now().toString()
        },
      });
    }

    // If no cache, try to fetch directly (fallback)
    console.log('⚠️  Cache miss, fetching directly from Wynncraft API');
    const response = await fetch('https://api.wynncraft.com/v3/guild/list/territory', {
      headers: {
        'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
    }

    const territories = await response.json();
    
    return NextResponse.json(territories, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=30',
        'X-Cache': 'MISS',
        'X-Cache-Timestamp': Date.now().toString()
      },
    });
  } catch (error) {
    console.error('Error fetching territories:', error);
    
    return NextResponse.json(
      { error: 'Failed to fetch territories' },
      { status: 500 }
    );
  }
}
