import { NextResponse } from 'next/server';

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

export async function GET() {
  try {
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
      headers['Cookie'] = sessionCookies;
    }

    const response = await fetch('https://nori.fish/api/aspects', {
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching aspects data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch aspects data' },
      { status: 500 }
    );
  }
}
