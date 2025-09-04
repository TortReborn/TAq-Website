import { NextRequest, NextResponse } from 'next/server';
import { aspectClassMap } from '@/lib/aspect-class-map';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'aspect-classes');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'aspect-classes');

  const jsonResponse = NextResponse.json({
    aspectClassMap,
    invertedMap: Object.fromEntries(
      Object.entries(aspectClassMap).flatMap(([className, aspects]) =>
        aspects.map(aspect => [aspect, className])
      )
    )
  });
  
  return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
}