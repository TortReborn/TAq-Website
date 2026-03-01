import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

// Kick rank order - lower = kicked first (matches bot's Commands/activity.py)
const KICK_RANK_ORDER: Record<string, number> = {
  'Starfish': 0,
  'Manatee': 1,
  'Piranha': 2,
  'Barracuda': 3,
  'Angler': 4,
  'Hammerhead': 5,
  'Sailfish': 6,
  'Dolphin': 7,
  'Narwhal': 9,
  'Hydra': 10,
};

// 5 hours per week threshold
const WEEKLY_REQUIREMENT = 5.0;

interface Member {
  username: string;
  uuid: string;
  online?: boolean;
  server?: string | null;
  contributed: number;
  joined?: string;
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

const TIME_PERIODS = [7, 14, 30] as const;

function calculateDelta(current: number, historical: number | undefined): { value: number; hasData: boolean } {
  if (historical === undefined) return { value: 0, hasData: false };
  return { value: Math.max(0, current - historical), hasData: true };
}

export async function GET(request: NextRequest) {
  const session = requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    const guildDataRaw = await simpleDatabaseCache.getGuildData(clientIP);

    if (!guildDataRaw) {
      return NextResponse.json({ error: 'Guild data not available' }, { status: 503 });
    }

    const allSnapshots = await simpleDatabaseCache.getPlayerActivitySnapshots([...TIME_PERIODS], clientIP);

    let allMembers: Member[] = [];
    if (guildDataRaw && (guildDataRaw as any).members) {
      const members = (guildDataRaw as any).members;
      if (Array.isArray(members)) {
        allMembers = members.map((m: any) => ({
          ...m,
          username: m.name,
          guildRankName: m.rank,
          wars: m.wars || 0,
          raids: m.raids || 0,
          shells: m.shells || 0,
          lastJoin: m.lastJoin,
          playtime: m.playtime || 0,
          contributed: m.contributed || 0,
        }));
      }
    }

    // Fetch Discord ranks
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

      const now = Date.now();

      const enrichedMembers = allMembers.map(member => {
        const discord = discordLinks[member.uuid];
        const discordRank = discord?.rank || '';

        // Calculate time frame deltas
        const timeFrames: Record<string, any> = {};
        for (const days of TIME_PERIODS) {
          const historicalData = allSnapshots[days] || {};
          const hist = historicalData[member.uuid] as HistoricalMember | undefined;

          if (!hist) {
            timeFrames[String(days)] = {
              playtime: 0, wars: 0, raids: 0, shells: 0, contributed: 0,
              hasCompleteData: false,
            };
          } else {
            const pt = calculateDelta(member.playtime, hist.playtime);
            const wa = calculateDelta(member.wars, hist.wars);
            const ra = calculateDelta(member.raids, hist.raids);
            const sh = calculateDelta(member.shells, hist.shells);
            const co = calculateDelta(member.contributed, hist.contributed);
            timeFrames[String(days)] = {
              playtime: pt.value,
              wars: wa.value,
              raids: ra.value,
              shells: sh.value,
              contributed: co.value,
              hasCompleteData: pt.hasData && wa.hasData,
            };
          }
        }

        // Calculate kick suitability (using 14-day window, matching bot)
        const joinedDate = member.joined ? new Date(member.joined) : null;
        const daysSinceJoin = joinedDate
          ? (now - joinedDate.getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        const isNewMember = daysSinceJoin < 7;

        // Calculate weekly playtime rate from 14-day window
        const pt14 = timeFrames['14']?.playtime ?? 0;
        const weeklyPlaytime = pt14 / 2; // 14 days = 2 weeks

        const belowThreshold = !isNewMember && weeklyPlaytime < WEEKLY_REQUIREMENT;
        const kickRankScore = KICK_RANK_ORDER[discordRank] ?? 5;

        // Last seen calculation
        const lastJoinDate = member.lastJoin ? new Date(member.lastJoin) : null;
        const inactiveDays = lastJoinDate
          ? Math.floor((now - lastJoinDate.getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          username: member.username,
          uuid: member.uuid,
          online: member.online || false,
          server: member.server,
          discordRank,
          guildRankName: member.guildRankName,
          contributed: member.contributed,
          totalPlaytime: member.playtime,
          totalWars: member.wars,
          totalRaids: member.raids,
          joined: member.joined,
          lastJoin: member.lastJoin,
          inactiveDays,
          timeFrames,
          // Kick suitability data
          weeklyPlaytime: Math.round(weeklyPlaytime * 100) / 100,
          belowThreshold,
          isNewMember,
          kickRankScore,
        };
      });

      return NextResponse.json({
        members: enrichedMembers,
        weeklyRequirement: WEEKLY_REQUIREMENT,
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Exec activity error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch activity data' },
      { status: 500 }
    );
  }
}
