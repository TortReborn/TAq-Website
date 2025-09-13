import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

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
    const guildDataRaw = await simpleDatabaseCache.getGuildData(clientIP);
    if (!guildDataRaw) {
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

    // Handle new data format - members is already a flat array
    let allMembers: any[] = [];
    
    if (guildDataRaw && (guildDataRaw as any).members) {
      const members = (guildDataRaw as any).members;
      
      if (Array.isArray(members)) {
        // New format: members is a flat array with name, rank, uuid, etc.
        allMembers = members.map((member: any) => ({
          ...member,
          username: member.name,
          guildRankName: member.rank,
          wars: member.wars || 0,
          raids: member.raids || 0,
          shells: member.shells || 0,
          lastJoin: member.lastJoin,
          playtime: member.playtime || 0,
          contributed: member.contributed || 0,
        }));
      } else if (members && typeof members === 'object') {
        // Old format: members organized by rank groups
        Object.entries(members).forEach(([rank, rankGroup]) => {
          if (rank === 'total') return;
          Object.entries(rankGroup as any).forEach(([username, memberObj]) => {
            if (memberObj && typeof memberObj === 'object' && (memberObj as any).uuid) {
              allMembers.push({
                ...memberObj,
                username,
                guildRankName: rank,
              });
            }
          });
        });
      }
    }

    // Fetch Discord ranks from database
    const pool = getPool();
    const client = await pool.connect();
    
    try {
      const discordLinksResult = await client.query(
        'SELECT uuid, rank, discord_id, ign FROM discord_links'
      );
      const discordLinks: Record<string, any> = {};
      discordLinksResult.rows.forEach((row: any) => {
        discordLinks[row.uuid] = row;
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

      // Map Discord ranks to members by uuid
      const mappedMembers = allMembers.map(member => {
        const discord = discordLinks[member.uuid];
        return {
          ...member,
          discordRank: discord ? discord.rank : '',
          discordId: discord ? discord.discord_id : '',
          discordUsername: discord ? discord.ign : '',
        };
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

      mappedMembers.sort((a, b) => {
        const aRankPriority = a.discordRank ? (discordRankPriority[a.discordRank] || 999) : 999;
        const bRankPriority = b.discordRank ? (discordRankPriority[b.discordRank] || 999) : 999;
        if (aRankPriority !== bRankPriority) {
          return aRankPriority - bRankPriority;
        }
        if (a.guildRank !== b.guildRank) {
          return b.guildRank - a.guildRank;
        }
        return a.username.localeCompare(b.username);
      });

      const guildData = guildDataRaw as any;
      const jsonResponse = NextResponse.json({
        guild: {
          name: guildData.name || 'Tort',
          prefix: guildData.prefix || 'TORT',
          level: guildData.level || 0,
          territories: guildData.territories || 0,
          totalMembers: Array.isArray(guildData.members) ? guildData.members.length : (guildData.members?.total || 0),
          onlineMembers: guildData.online || 0
        },
        members: mappedMembers
      }, {
        headers: {
          'X-Cache': guildDataRaw ? 'HIT' : 'MISS',
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
