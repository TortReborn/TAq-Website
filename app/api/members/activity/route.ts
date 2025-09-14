import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

interface Member {
  username: string;
  uuid: string;
  online?: boolean;
  server?: string | null;
  contributed: number;
  guildRank?: number;
  contributionRank?: number;
  joined?: string;
  discordRank?: string;
  discordId?: string;
  discordUsername?: string;
  guildRankName: string;
  wars: number;
  raids: number;
  shells: number;
  lastJoin: string | null;
  playtime: number;
}

interface HistoricalMember {
  name: string;
  rank: string;
  uuid: string;
  wars: number;
  raids: number;
  shells: number;
  playtime: number;
  contributed: number;
}

interface TimeFrameData {
  current: Member[];
  timeFrameStats: Record<string, {
    wars: number;
    raids: number;
    shells: number;
    contributed: number;
    playtime: number;
    hasCompleteData: boolean;
  }>;
}

// Calculate the difference between current and historical values
function calculateTimeDelta(
  currentValue: number,
  historicalValue: number | undefined,
  timeFrame: string
): { value: number; hasCompleteData: boolean } {
  // For all-time, just return current value
  if (timeFrame === 'all') {
    return { value: currentValue, hasCompleteData: true };
  }

  // If no historical data, member is new - return 0 or current based on context
  if (historicalValue === undefined) {
    return { value: 0, hasCompleteData: false };
  }

  // Calculate delta (current - baseline)
  const delta = currentValue - historicalValue;

  // Protect against negative values (data resets/corrections)
  return {
    value: Math.max(0, delta),
    hasCompleteData: true
  };
}

export async function GET(request: NextRequest) {
  // Get time frame from query params
  const searchParams = request.nextUrl.searchParams;
  const timeFrame = searchParams.get('timeFrame') || 'all';

  // Check rate limit
  const rateLimitCheck = checkRateLimit(request, 'members');

  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }

  // Increment rate limit counter
  incrementRateLimit(request, 'members');

  try {
    const clientIP = request.headers.get('x-forwarded-for') ||
                    request.headers.get('x-real-ip') ||
                    'unknown';

    // Get current guild data
    const guildDataRaw = await simpleDatabaseCache.getGuildData(clientIP);
    if (!guildDataRaw) {
      return NextResponse.json(
        { error: 'Guild member data not available.' },
        {
          status: 503,
          headers: {
            'X-Cache': 'MISS',
            'Retry-After': '30'
          }
        }
      );
    }

    // Get player activity cache for historical data
    let historicalData: Record<string, HistoricalMember> = {};

    if (timeFrame !== 'all') {
      const activityCache = await simpleDatabaseCache.getPlayerActivityCache(clientIP);

      if (activityCache && activityCache.days) {
        // Map time frame to cache key
        const cacheKeyMap: Record<string, string> = {
          '1': 'day_1',
          '7': 'day_7',
          '14': 'day_14',
          '30': 'day_30'
        };

        const cacheKey = cacheKeyMap[timeFrame];
        if (cacheKey && activityCache.days[cacheKey]) {
          const dayData = activityCache.days[cacheKey];
          if (dayData.members && Array.isArray(dayData.members)) {
            // Create a map of historical data by UUID
            dayData.members.forEach((member: HistoricalMember) => {
              if (member.uuid) {
                historicalData[member.uuid] = member;
              }
            });
          }
        }
      }
    }

    // Process current members
    let allMembers: Member[] = [];

    if (guildDataRaw && (guildDataRaw as any).members) {
      const members = (guildDataRaw as any).members;

      if (Array.isArray(members)) {
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

      // Calculate time-based stats for each member
      const membersWithTimeStats = allMembers.map(member => {
        const discord = discordLinks[member.uuid];
        const historical = historicalData[member.uuid];

        // Calculate deltas for the selected time frame
        let timeFrameStats = {
          wars: member.wars,
          raids: member.raids,
          shells: member.shells,
          contributed: member.contributed,
          playtime: member.playtime,
          hasCompleteData: true
        };

        if (timeFrame !== 'all' && historical) {
          const warsDelta = calculateTimeDelta(member.wars, historical.wars, timeFrame);
          const raidsDelta = calculateTimeDelta(member.raids, historical.raids, timeFrame);
          const shellsDelta = calculateTimeDelta(member.shells, historical.shells, timeFrame);
          const contributedDelta = calculateTimeDelta(member.contributed, historical.contributed, timeFrame);
          const playtimeDelta = calculateTimeDelta(member.playtime, historical.playtime, timeFrame);

          timeFrameStats = {
            wars: warsDelta.value,
            raids: raidsDelta.value,
            shells: shellsDelta.value,
            contributed: contributedDelta.value,
            playtime: playtimeDelta.value,
            hasCompleteData: warsDelta.hasCompleteData &&
                           raidsDelta.hasCompleteData &&
                           shellsDelta.hasCompleteData &&
                           contributedDelta.hasCompleteData &&
                           playtimeDelta.hasCompleteData
          };
        } else if (timeFrame !== 'all') {
          // No historical data for this member - they're new
          timeFrameStats = {
            wars: 0,
            raids: 0,
            shells: 0,
            contributed: 0,
            playtime: 0,
            hasCompleteData: false
          };
        }

        return {
          ...member,
          discordRank: discord ? discord.rank : '',
          discordId: discord ? discord.discord_id : '',
          discordUsername: discord ? discord.ign : '',
          // Add time frame specific values
          timeFrameWars: timeFrameStats.wars,
          timeFrameRaids: timeFrameStats.raids,
          timeFrameShells: timeFrameStats.shells,
          timeFrameContributed: timeFrameStats.contributed,
          timeFramePlaytime: timeFrameStats.playtime,
          hasCompleteData: timeFrameStats.hasCompleteData
        };
      });

      // Sort by Discord rank priority
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

      membersWithTimeStats.sort((a, b) => {
        const aRankPriority = a.discordRank ? (discordRankPriority[a.discordRank] || 999) : 999;
        const bRankPriority = b.discordRank ? (discordRankPriority[b.discordRank] || 999) : 999;
        if (aRankPriority !== bRankPriority) {
          return aRankPriority - bRankPriority;
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
        members: membersWithTimeStats,
        timeFrame: timeFrame,
        hasHistoricalData: Object.keys(historicalData).length > 0
      }, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Timestamp': Date.now().toString(),
          'X-Time-Frame': timeFrame
        }
      });

      return addRateLimitHeaders(jsonResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Error fetching member activity:', error);
    const errorResponse = NextResponse.json(
      { error: 'Failed to fetch member activity data' },
      { status: 500 }
    );
    return addRateLimitHeaders(errorResponse, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
  }
}