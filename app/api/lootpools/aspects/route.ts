import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import cache from '@/lib/cache';

async function initSession() {
  try {
    // First, initialize session by hitting the tokens endpoint
    const tokensResponse = await fetch('https://nori.fish/api/tokens', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    
    // Extract cookies from the response
    const cookies = tokensResponse.headers.get('set-cookie') || '';
    return cookies;
  } catch (error) {
    console.log('Token initialization failed, continuing without session');
    return '';
  }
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'aspects');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'aspects');

  try {
    // Try to get data from cache first
    const cachedData = await cache.getAspectData();
    
    if (cachedData) {
      console.log('✨ Serving aspect data from cache');
      const jsonResponse = NextResponse.json(cachedData);
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, fallback to direct API call
    console.log('📡 Cache miss - fetching aspect data directly from Athena API');
    
    // Initialize session first
    const sessionCookies = await initSession();
    
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    };
    
    // Add cookies if we got them
    if (sessionCookies) {
      headers['Cookie'] = sessionCookies.split(';')[0];
    }

    const response = await fetch('https://nori.fish/api/aspects', {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      console.error(`Aspects API error: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Aspects request successful');
    
    const jsonResponse = NextResponse.json(data);
    return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    console.error('Error fetching aspects data:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch aspects data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
