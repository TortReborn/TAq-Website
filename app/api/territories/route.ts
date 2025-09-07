import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('https://api.wynncraft.com/v3/guild/list/territory', {
      headers: {
        'User-Agent': 'Tort-Reborn-Graid-Event-Website/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Wynncraft API error: ${response.status} ${response.statusText}`);
    }

    const territories = await response.json();
    
    return NextResponse.json(territories, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=30', // Cache for 30 seconds
      },
    });
  } catch (error) {
    console.error('Error fetching territories from Wynncraft API:', error);
    
    // Return an error response that the client can handle
    return NextResponse.json(
      { error: 'Failed to fetch territories from Wynncraft API' },
      { status: 500 }
    );
  }
}
