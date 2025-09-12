import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

interface GuildColorData {
  _id: string;
  prefix?: string;
  color?: string;
}

export async function POST(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'guild-colors');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'guild-colors');

  try {
    // Get requested guild names from request body
    const { guildNames } = await request.json();
    
    if (!Array.isArray(guildNames)) {
      return NextResponse.json(
        { error: 'Invalid request: guildNames must be an array' },
        { status: 400 }
      );
    }

    // Get client IP for cache key
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // First, check if we have guild colors in cache
    const cachedGuilds = await simpleDatabaseCache.getGuildColors(clientIP);

    let guildColors: Record<string, { color: string, prefix?: string }> = {};
    let needsUpdate = false;

    if (cachedGuilds && Array.isArray(cachedGuilds)) {
      
      // Build a map from cached data
      const cachedMap: Record<string, { color: string, prefix?: string }> = {};
      for (const guild of cachedGuilds) {
        if (guild.color) {
          // Index by guild name
          if (guild._id) {
            cachedMap[guild._id.toLowerCase()] = { 
              color: guild.color, 
              prefix: guild.prefix 
            };
          }
          // Index by prefix if available
          if (guild.prefix) {
            cachedMap[guild.prefix.toLowerCase()] = { 
              color: guild.color, 
              prefix: guild.prefix 
            };
          }
        }
      }

      // Check if all requested guilds are in cache
      for (const guildName of guildNames) {
        if (guildName && guildName !== 'Unclaimed') {
          const lowerName = guildName.toLowerCase();
          if (!cachedMap[lowerName]) {
            needsUpdate = true;
            break;
          } else {
            guildColors[guildName] = cachedMap[lowerName];
          }
        }
      }
    } else {
      needsUpdate = true;
    }

    // If we need to update, fetch from Wynntils API
    if (needsUpdate) {
      try {
        const response = await fetch('https://athena.wynntils.com/cache/get/guildList');
        
        if (!response.ok) {
          console.warn('Failed to fetch guild colors from Wynntils API');
          // Return what we have from cache, or empty
          return NextResponse.json(
            { guildColors },
            { 
              status: 200,
              headers: {
                'X-Cache': 'PARTIAL',
                'X-Cache-Source': 'PostgreSQL'
              }
            }
          );
        }

        const guilds = await response.json() as GuildColorData[];
        
        // Save to database cache using simpleDatabaseCache
        await simpleDatabaseCache.setGuildColors(guilds, clientIP);

        // Build response map
        guildColors = {};
        for (const guild of guilds) {
          if (guild.color) {
            // Match requested guild names
            for (const guildName of guildNames) {
              if (guildName && guildName !== 'Unclaimed') {
                const lowerName = guildName.toLowerCase();
                const lowerGuildId = guild._id?.toLowerCase();
                const lowerPrefix = guild.prefix?.toLowerCase();
                
                if (lowerGuildId === lowerName || lowerPrefix === lowerName) {
                  guildColors[guildName] = { 
                    color: guild.color, 
                    prefix: guild.prefix 
                  };
                }
              }
            }
          }
        }

        return NextResponse.json(
          { guildColors },
          { 
            status: 200,
            headers: {
              'X-Cache': 'MISS',
              'X-Cache-Source': 'Wynntils-API'
            }
          }
        );

      } catch (error) {
        console.error('Error fetching from Wynntils API:', error);
        return NextResponse.json(
          { guildColors },
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

    // All guilds were in cache
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
    console.error('Error in guild-colors API:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch guild colors' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}