import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'aspects');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'aspects');

  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get aspect data from database cache only (managed by external bot)
    const cachedData = await simpleDatabaseCache.getAspectData(clientIP);
    
    if (cachedData) {
      console.log('✨ Serving aspect data from cache (external bot managed)');
      const jsonResponse = NextResponse.json(cachedData);
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, return error (data managed by external bot)
    console.log('❌ No aspect data available from cache');
    const errorResponse = NextResponse.json(
      { error: 'Aspect data not available. External bot may be updating data.' },
      { 
        status: 503,
        headers: {
          'X-Cache': 'MISS',
          'X-Cache-Source': 'PostgreSQL-Bot-Managed',
          'Retry-After': '30'
        }
      }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    console.error('Error fetching aspect data from cache:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch aspect data from cache', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
