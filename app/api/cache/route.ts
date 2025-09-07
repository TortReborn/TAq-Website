import { NextResponse } from 'next/server';
import cache from '@/lib/cache';

export async function GET() {
  try {
    const status = cache.getCacheStatus();
    
    return NextResponse.json({
      status: 'healthy',
      cache: status,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error getting cache status:', error);
    
    return NextResponse.json(
      { 
        status: 'error',
        error: 'Failed to get cache status',
        timestamp: Date.now()
      },
      { status: 500 }
    );
  }
}
