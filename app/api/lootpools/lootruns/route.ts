import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';


export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'lootruns');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'lootruns');

  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get lootpool data from database cache only (managed by external bot)
    const cachedData = await simpleDatabaseCache.getLootpoolData(clientIP);
    
    if (cachedData) {
      console.log('✨ Serving lootpool data from cache (external bot managed)');
      const jsonResponse = NextResponse.json(cachedData);
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, return error (data managed by external bot)
    console.log('❌ No lootpool data available from cache');
    const errorResponse = NextResponse.json(
      { error: 'Lootpool data not available. External bot may be updating data.' },
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
    console.error('Error fetching lootpool data:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch lootpool data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
