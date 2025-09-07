import { NextResponse } from 'next/server';
import dbCache from '@/lib/db-cache';

export async function GET() {
  try {
    // Clean up expired entries first
    await dbCache.cleanupExpired();
    
    // Get cache status from PostgreSQL
    const status = await dbCache.getCacheStatus();
    
    return NextResponse.json({
      status: 'healthy',
      cache: status,
      timestamp: Date.now(),
      source: 'PostgreSQL'
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to get cache status',
        timestamp: Date.now(),
        source: 'PostgreSQL'
      },
      { status: 500 }
    );
  }
}
