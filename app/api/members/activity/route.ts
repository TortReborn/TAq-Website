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
  uuid: string;
  wars: number;
  raids: number;
  shells: number;
  playtime: number;
  contributed: number;
}

interface TimeFrameStats {
  wars: number;
  raids: number;
  shells: number;
  contributed: number;
  playtime: number;
  hasCompleteData: boolean;
}

const TIME_PERIODS = [1, 7, 14, 30] as const;

// Calculate the difference between current and historical values
function calculateTimeDelta(
  currentValue: number,
  historicalValue: number | undefined
): { value: number; hasCompleteData: boolean } {
  // If no historical data, member is new
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

// Calculate stats for a specific time period
function calculateTimeFrameStats(
  member: Member,
  historical: HistoricalMember | undefined
): TimeFrameStats {
  if (!historical) {
    return {
      wars: 0,
      raids: 0,
      shells: 0,
      contributed: 0,
      playtime: 0,
      hasCompleteData: false
    };
  }

  const warsDelta = calculateTimeDelta(member.wars, historical.wars);
  const raidsDelta = calculateTimeDelta(member.raids, historical.raids);
  const shellsDelta = calculateTimeDelta(member.shells, historical.shells);
  const contributedDelta = calculateTimeDelta(member.contributed, historical.contributed);
  const playtimeDelta = calculateTimeDelta(member.playtime, historical.playtime);

  return {
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

    // Fetch all time period snapshots in a single query
    const allSnapshots = await simpleDatabaseCache.getPlayerActivitySnapshots([...TIME_PERIODS], clientIP);

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

      // Calculate time-based stats for ALL time periods for each member
      const membersWithAllTimeStats = allMembers.map(member => {
        const discord = discordLinks[member.uuid];

        // Calculate stats for each time period
        const timeFrames: Record<string, TimeFrameStats> = {};
        for (const days of TIME_PERIODS) {
          const historicalData = allSnapshots[days] || {};
          const historical = historicalData[member.uuid];
          timeFrames[String(days)] = calculateTimeFrameStats(member, historical);
        }

        // Add "all" time frame (current values)
        timeFrames['all'] = {
          wars: member.wars,
          raids: member.raids,
          shells: member.shells,
          contributed: member.contributed,
          playtime: member.playtime,
          hasCompleteData: true
        };

        return {
          ...member,
          discordRank: discord ? discord.rank : '',
          discordId: discord ? discord.discord_id : '',
          discordUsername: discord ? discord.ign : '',
          timeFrames
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

      membersWithAllTimeStats.sort((a, b) => {
        const aRankPriority = a.discordRank ? (discordRankPriority[a.discordRank] || 999) : 999;
        const bRankPriority = b.discordRank ? (discordRankPriority[b.discordRank] || 999) : 999;
        if (aRankPriority !== bRankPriority) {
          return aRankPriority - bRankPriority;
        }
        return a.username.localeCompare(b.username);
      });

      // Check which time periods have data
      const hasHistoricalData: Record<string, boolean> = {};
      for (const days of TIME_PERIODS) {
        hasHistoricalData[String(days)] = Object.keys(allSnapshots[days] || {}).length > 0;
      }
      hasHistoricalData['all'] = true;

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
        members: membersWithAllTimeStats,
        hasHistoricalData
      }, {
        headers: {
          'X-Cache': 'HIT',
          'X-Cache-Timestamp': Date.now().toString()
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