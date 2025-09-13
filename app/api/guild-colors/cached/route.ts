import { NextRequest, NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Simply get whatever is cached in the guildColors table
    const cachedGuilds = await simpleDatabaseCache.getGuildColors('server');

    if (!cachedGuilds || !Array.isArray(cachedGuilds)) {
      return NextResponse.json(
        { guildColors: {} },
        { 
          status: 200,
          headers: {
            'X-Cache': 'EMPTY',
            'X-Cache-Source': 'PostgreSQL'
          }
        }
      );
    }

    // Build a simple color map from cached data
    const guildColors: Record<string, string> = {};
    
    for (const guild of cachedGuilds) {
      if (guild.color) {
        // Index by guild name
        if (guild._id) {
          guildColors[guild._id] = guild.color;
        }
        // Index by prefix if available
        if (guild.prefix) {
          guildColors[guild.prefix] = guild.color;
        }
      }
    }

    return NextResponse.json(
      { guildColors },
      { 
        status: 200,
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Source': 'PostgreSQL'
        }
      }
    );

  } catch (error) {
    console.error('Error reading cached guild colors:', error);
    return NextResponse.json(
      { guildColors: {} },
      { 
        status: 200,
        headers: {
          'X-Cache': 'ERROR',
          'X-Cache-Source': 'PostgreSQL-Fallback'
        }
      }
    );
  }
}