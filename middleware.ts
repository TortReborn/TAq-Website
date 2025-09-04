import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse } from './lib/rate-limit';

export function middleware(request: NextRequest) {
  // Only apply rate limiting to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Global rate limiting check (this runs before the specific endpoint rate limiting)
    const rateLimitCheck = checkRateLimit(request);
    
    if (!rateLimitCheck.allowed) {
      return createRateLimitResponse(rateLimitCheck.resetTime);
    }
    
    // Increment global rate limit counter
    incrementRateLimit(request);
    
    // Add rate limit headers to the response
    const response = NextResponse.next();
    response.headers.set('X-RateLimit-Limit', '30');
    response.headers.set('X-RateLimit-Remaining', rateLimitCheck.remainingRequests.toString());
    response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitCheck.resetTime / 1000).toString());
    
    return response;
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/:path*'
  ]
};
