import { NextRequest, NextResponse } from 'next/server';

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 30; // Maximum requests per window
const MAX_REQUESTS_PER_ENDPOINT = 10; // Maximum requests per specific endpoint per window

// In-memory store for rate limiting (use Redis in production)
const requestCounts = new Map<string, { count: number; endpointCounts: Map<string, number>; resetTime: number }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now > data.resetTime) {
      requestCounts.delete(key);
    }
  }
}, RATE_LIMIT_WINDOW);

export function getRateLimitKey(request: NextRequest): string {
  // Use IP address as the primary identifier
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : request.ip || 'unknown';
  
  // You could also include user agent or other identifiers
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  // Create a hash-like key (simplified)
  return `${ip}:${userAgent.substring(0, 50)}`;
}

export function checkRateLimit(request: NextRequest, endpoint?: string): { allowed: boolean; remainingRequests: number; resetTime: number } {
  const key = getRateLimitKey(request);
  const now = Date.now();
  
  // Get or create rate limit data for this key
  let rateLimitData = requestCounts.get(key);
  
  if (!rateLimitData || now > rateLimitData.resetTime) {
    // Create new rate limit window
    rateLimitData = {
      count: 0,
      endpointCounts: new Map(),
      resetTime: now + RATE_LIMIT_WINDOW
    };
    requestCounts.set(key, rateLimitData);
  }
  
  // Check global rate limit
  if (rateLimitData.count >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      remainingRequests: 0,
      resetTime: rateLimitData.resetTime
    };
  }
  
  // Check endpoint-specific rate limit if endpoint is provided
  if (endpoint) {
    const endpointCount = rateLimitData.endpointCounts.get(endpoint) || 0;
    if (endpointCount >= MAX_REQUESTS_PER_ENDPOINT) {
      return {
        allowed: false,
        remainingRequests: 0,
        resetTime: rateLimitData.resetTime
      };
    }
  }
  
  return {
    allowed: true,
    remainingRequests: MAX_REQUESTS_PER_WINDOW - rateLimitData.count - 1,
    resetTime: rateLimitData.resetTime
  };
}

export function incrementRateLimit(request: NextRequest, endpoint?: string): void {
  const key = getRateLimitKey(request);
  const rateLimitData = requestCounts.get(key);
  
  if (rateLimitData) {
    rateLimitData.count++;
    
    if (endpoint) {
      const currentCount = rateLimitData.endpointCounts.get(endpoint) || 0;
      rateLimitData.endpointCounts.set(endpoint, currentCount + 1);
    }
  }
}

export function createRateLimitResponse(resetTime: number): NextResponse {
  const timeUntilReset = Math.ceil((resetTime - Date.now()) / 1000);
  
  return NextResponse.json(
    { 
      error: 'Rate limit exceeded', 
      message: `Too many requests. Please try again in ${timeUntilReset} seconds.`,
      retryAfter: timeUntilReset
    },
    { 
      status: 429,
      headers: {
        'Retry-After': timeUntilReset.toString(),
        'X-RateLimit-Limit': MAX_REQUESTS_PER_WINDOW.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(resetTime / 1000).toString()
      }
    }
  );
}

export function addRateLimitHeaders(response: NextResponse, remainingRequests: number, resetTime: number): NextResponse {
  response.headers.set('X-RateLimit-Limit', MAX_REQUESTS_PER_WINDOW.toString());
  response.headers.set('X-RateLimit-Remaining', remainingRequests.toString());
  response.headers.set('X-RateLimit-Reset', Math.ceil(resetTime / 1000).toString());
  
  return response;
}
