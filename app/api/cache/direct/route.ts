import { NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export async function GET() {
  try {
    // Get cache status from the simplified cache system
    const cacheStatus = await simpleDatabaseCache.getCacheStatus();
    const rateLimitStatus = simpleDatabaseCache.getRateLimitStatus();

    return NextResponse.json({
      status: 'healthy',
      cache: cacheStatus,
      rateLimits: rateLimitStatus,
      timestamp: Date.now(),
      source: 'PostgreSQL-Bot-Managed',
      message: 'Cache is managed by external bot. No API calls made from web app.'
    });

  } catch (error) {
    console.error('Error getting cache status:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to get cache status from database',
        timestamp: Date.now(),
        source: 'PostgreSQL-Bot-Managed'
      },
      { status: 500 }
    );
  }
}
