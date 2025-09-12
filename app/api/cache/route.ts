import { NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export async function GET() {
  try {
    // Get cache status from PostgreSQL (external bot managed)
    const status = await simpleDatabaseCache.getCacheStatus();
    const rateLimits = simpleDatabaseCache.getRateLimitStatus();
    
    return NextResponse.json({
      status: 'healthy',
      cache: status,
      rateLimits: rateLimits,
      timestamp: Date.now(),
      source: 'PostgreSQL-Bot-Managed',
      message: 'Cache data is managed by external bot'
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to get cache status',
        timestamp: Date.now(),
        source: 'PostgreSQL-Bot-Managed'
      },
      { status: 500 }
    );
  }
}
