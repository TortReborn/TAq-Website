import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import cache from '@/lib/cache';

async function initSessionAndGetCookies() {
  try {
    console.log('Initializing fresh session...');
    // Initialize session by hitting the tokens endpoint (like Discord bot does)
    const tokensResponse = await fetch('https://nori.fish/api/tokens', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    // Extract cookies from Set-Cookie headers
    const setCookieHeaders = tokensResponse.headers.getSetCookie?.() || [];
    let cookies = '';
    let csrfToken = '';
    
    if (setCookieHeaders.length > 0) {
      cookies = setCookieHeaders.map(cookie => cookie.split(';')[0]).join('; ');
      console.log('Session initialized with cookies');
    } else {
      // Fallback: try to get from single set-cookie header
      const singleCookie = tokensResponse.headers.get('set-cookie');
      if (singleCookie) {
        cookies = singleCookie.split(';')[0];
        console.log('Session initialized with fallback method');
      }
    }
    
    // Extract CSRF token (check both names like Discord bot)
    if (cookies) {
      const csrfMatch = cookies.match(/csrf_token=([^;,\s]+)/i) || cookies.match(/csrftoken=([^;,\s]+)/i);
      if (csrfMatch) {
        csrfToken = csrfMatch[1];
        console.log('CSRF token extracted');
      }
    }
    
    return { cookies, csrfToken };
  } catch (error) {
    console.log('Session initialization failed:', error);
    return { cookies: '', csrfToken: '' };
  }
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'lootruns');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'lootruns');

  try {
    // Try to get data from cache first
    const cachedData = cache.getLootpoolData();
    
    if (cachedData) {
      console.log('✨ Serving lootpool data from cache');
      const jsonResponse = NextResponse.json(cachedData);
      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
    }

    // If no cached data, fallback to direct API call
    console.log('📡 Cache miss - fetching lootpool data directly from Athena API');
    
    // Initialize session fresh each time (like Discord bot)
    const { cookies, csrfToken } = await initSessionAndGetCookies();
    
    // Build headers - keep it minimal like Discord bot
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    // Add cookies if we have them
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    // Add CSRF token if we have it (like Discord bot)
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
    
    console.log('Making lootpool request with cookies:', !!cookies, 'and CSRF token:', !!csrfToken);
    
    const response = await fetch('https://nori.fish/api/lootpool', {
      method: 'GET',
      headers
    });

    if (!response.ok) {
      console.error(`Lootpool API error: ${response.status} ${response.statusText}`);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('Lootpool request successful');
    
    const jsonResponse = NextResponse.json(data);
    return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  } catch (error) {
    console.error('Error fetching lootpool data:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch lootpool data', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
