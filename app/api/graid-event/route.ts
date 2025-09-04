import { NextRequest, NextResponse } from 'next/server';
import { fetchActiveEvent, fetchMostRecentEvent } from '@/lib/graid';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'graid-event');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'graid-event');

  try {
    const { event, rows } = await fetchActiveEvent();
    let fallback = null;
    if (!event) {
      fallback = await fetchMostRecentEvent();
    }

    const showEvent = event || fallback?.event;
    const showRows = event ? rows : fallback?.rows || [];
    const isFallback = !event && !!fallback?.event;

    const jsonResponse = NextResponse.json({
      event: showEvent,
      rows: showRows,
      isFallback
    });
    
    return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    console.error('Error fetching graid event data:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch event data' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
