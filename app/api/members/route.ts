import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

// Define types for the API response
interface Member {
  username: string;
  online: boolean;
  server: string | null;
  contributed: number;
  guildRank: number;
  contributionRank?: number;
  joined: string;
}

interface GuildApiResponse {
  uuid: string;
  name: string;
  prefix: string;
  level: number;
  xpPercent: number;
  territories: number;
  wars: number;
  created: string;
  members: {
    total: number;
    owner: Record<string, Member>;
    chief: Record<string, Member>;
    strategist: Record<string, Member>;
    captain: Record<string, Member>;
    recruiter: Record<string, Member>;
    recruit: Record<string, Member>;
  };
  online: number;
  banner: any;
  seasonRanks: any;
}

interface DiscordLink {
  ign: string;
  rank: string;
}

interface MemberWithDiscordRank extends Member {
  discordRank: string | null;
  guildRankName: string;
}

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'members');
  
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'members');

  try {
    // Get client IP for rate limiting
    const clientIP = request.headers.get('x-forwarded-for') || 
                    request.headers.get('x-real-ip') || 
                    'unknown';

    // Get guild data from database cache only (managed by external bot)
    const guildData = await simpleDatabaseCache.getGuildData(clientIP) as GuildApiResponse | null;
    
    if (!guildData) {
      return NextResponse.json(
        { error: 'Guild member data not available. External bot may be updating data.' },
        { 
          status: 503,
          headers: {
            'X-Cache': 'MISS',
            'X-Cache-Source': 'PostgreSQL-Bot-Managed',
            'Retry-After': '30'
          }
        }
      );
    }

    // Fetch Discord ranks from database
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      const discordLinksResult = await client.query(
        'SELECT ign, rank FROM discord_links'
      );
      
      const discordLinks: Record<string, string> = {};
      discordLinksResult.rows.forEach((row: DiscordLink) => {
        discordLinks[row.ign.toLowerCase()] = row.rank;
      });

      // Convert guild ranks to readable names
      const guildRankNames: Record<string, string> = {
        'owner': 'Owner',
        'chief': 'Chief',
        'strategist': 'Strategist', 
        'captain': 'Captain',
        'recruiter': 'Recruiter',
        'recruit': 'Recruit'
      };

      // Combine all members from different ranks
      const allMembers: MemberWithDiscordRank[] = [];

      // Process each guild rank
      Object.entries(guildData.members).forEach(([rankKey, rankMembers]) => {
        if (rankKey === 'total') return;

        Object.entries(rankMembers as Record<string, Member>).forEach(([username, member]) => {
          const discordRank = discordLinks[username.toLowerCase()] || null;
          
          // Only include members with Discord ranks
          if (discordRank) {
            const memberWithRank: MemberWithDiscordRank = {
              ...member,
              username: username, // Use the key as the username
              discordRank: discordRank,
              guildRankName: guildRankNames[rankKey] || 'Unknown' // Use rankKey instead of member.guildRank
            };
            allMembers.push(memberWithRank);
          }
        });
      });

      // Sort by Discord rank priority (custom order)
      const discordRankPriority: Record<string, number> = {
        'Hydra': 1,
        'Narwhal': 2,
        'Dolphin': 3,
        'Sailfish': 4,
        'Hammerhead': 5,
        'Angler': 6,
        'Barracuda': 7,
        'Piranha': 8,
        'Manatee': 9,
        'Starfish': 10
      };

      allMembers.sort((a, b) => {
        const aRankPriority = a.discordRank ? (discordRankPriority[a.discordRank] || 999) : 999;
        const bRankPriority = b.discordRank ? (discordRankPriority[b.discordRank] || 999) : 999;
        
        if (aRankPriority !== bRankPriority) {
          return aRankPriority - bRankPriority;
        }
        
        // If same Discord rank, sort by guild rank (higher guild rank first)
        if (a.guildRank !== b.guildRank) {
          return b.guildRank - a.guildRank;
        }
        
        // If same ranks, sort by username
        return a.username.localeCompare(b.username);
      });

      const jsonResponse = NextResponse.json({
        guild: {
          name: guildData.name,
          prefix: guildData.prefix,
          level: guildData.level,
          territories: guildData.territories,
          totalMembers: guildData.members.total,
          onlineMembers: guildData.online
        },
        members: allMembers
      }, {
        headers: {
          'X-Cache': guildData ? 'HIT' : 'MISS',
          'X-Cache-Timestamp': Date.now().toString()
        }
      });

      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error fetching guild members:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch guild members' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}
