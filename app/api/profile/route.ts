import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

const BASE_TIME_PERIODS = [7, 14, 30];

export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const uuid = session.uuid;
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';

    // Parse optional custom days param
    const customDaysParam = request.nextUrl.searchParams.get('days');
    const customDays = customDaysParam ? Math.max(1, Math.min(3650, parseInt(customDaysParam, 10))) : null;
    const timePeriods = customDays && !BASE_TIME_PERIODS.includes(customDays)
      ? [...BASE_TIME_PERIODS, customDays]
      : BASE_TIME_PERIODS;

    // Get current guild data to find this member
    const guildDataRaw = await simpleDatabaseCache.getGuildData(clientIP);
    let memberData: any = null;
    if (guildDataRaw && (guildDataRaw as any).members) {
      const members = (guildDataRaw as any).members;
      if (Array.isArray(members)) {
        const normalizedUuid = uuid.replace(/-/g, '');
        memberData = members.find((m: any) =>
          m.uuid && m.uuid.replace(/-/g, '') === normalizedUuid
        );
      }
    }

    if (!memberData) {
      return NextResponse.json({ error: 'Member data not found in guild cache' }, { status: 404 });
    }

    // Fetch Wynncraft player data for server rank (VIP, CHAMPION, etc.)
    let wynnRank: string | null = null;
    try {
      const wynnRes = await fetch(`https://api.wynncraft.com/v3/player/${uuid}?fullResult`, { next: { revalidate: 300 } });
      if (wynnRes.ok) {
        const wynnData = await wynnRes.json();
        if (wynnData.rank && wynnData.rank !== 'Player') {
          wynnRank = wynnData.rank;
        } else if (wynnData.supportRank) {
          wynnRank = wynnData.supportRank;
        }
      }
    } catch { /* Wynncraft API failure is non-fatal */ }

    // Get activity snapshots for time-period deltas
    const allSnapshots = await simpleDatabaseCache.getPlayerActivitySnapshots(timePeriods, clientIP);
    const timeFrames: Record<string, { playtime: number; wars: number; raids: number; shells: number; contributed: number; hasCompleteData: boolean }> = {};
    for (const days of timePeriods) {
      const hist = (allSnapshots[days] || {})[uuid];
      if (!hist) {
        timeFrames[String(days)] = { playtime: 0, wars: 0, raids: 0, shells: 0, contributed: 0, hasCompleteData: false };
      } else {
        timeFrames[String(days)] = {
          playtime: Math.max(0, (memberData.playtime || 0) - hist.playtime),
          wars: Math.max(0, (memberData.wars || 0) - hist.wars),
          raids: Math.max(0, (memberData.raids || 0) - hist.raids),
          shells: Math.max(0, (memberData.shells || 0) - hist.shells),
          contributed: Math.max(0, (memberData.contributed || 0) - hist.contributed),
          hasCompleteData: true,
        };
      }
    }

    const pool = getPool();

    // Fetch weekly threshold setting
    const weeklyRequirement = await simpleDatabaseCache.getSetting<number>('weekly_threshold', 4.0);

    // Fetch profile customization (gradient), shells balance, and kick list status in parallel
    const [graidResult, customizationResult, shellsResult, kickListResult] = await Promise.all([
      pool.query(
        `SELECT ge.id, ge.title, ge.start_ts, ge.end_ts, get2.total
         FROM graid_event_totals get2
         JOIN graid_events ge ON ge.id = get2.event_id
         WHERE get2.uuid = $1
         ORDER BY ge.start_ts DESC
         LIMIT 10`,
        [uuid]
      ),
      pool.query(
        `SELECT gradient, background FROM profile_customization WHERE "user" = $1`,
        [session.discord_id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT balance FROM shells WHERE "user" = $1`,
        [session.discord_id]
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT tier FROM kick_list WHERE uuid = $1`,
        [uuid]
      ).catch(() => ({ rows: [] })),
    ]);

    const graidEvents = graidResult.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      startTs: r.start_ts?.toISOString?.() ?? null,
      endTs: r.end_ts?.toISOString?.() ?? null,
      completions: Number(r.total) || 0,
    }));

    const totalGraidCompletions = graidEvents.reduce((sum: number, e: any) => sum + e.completions, 0);

    // Profile customization
    const customization = customizationResult.rows[0];
    const gradient = customization?.gradient || null;
    const backgroundId = customization?.background || 1;

    // Shells balance
    const shellsBalance = shellsResult.rows[0]?.balance ?? 0;

    // Kick status
    const onKickList = kickListResult.rows.length > 0;
    const kickListTier = onKickList ? kickListResult.rows[0].tier : null;

    // Determine if below playtime threshold (using 14-day window, matching exec activity panel)
    const tf14 = timeFrames['14'];
    const threshold14 = (14 * weeklyRequirement) / 7;
    const joinedDate = memberData.joined ? new Date(memberData.joined) : null;
    const daysSinceJoin = joinedDate
      ? (Date.now() - joinedDate.getTime()) / (1000 * 60 * 60 * 24)
      : 999;
    const isNewMember = daysSinceJoin < 7;
    const isBelowThreshold = tf14?.hasCompleteData && !isNewMember && tf14.playtime < threshold14;

    return NextResponse.json({
      user: {
        uuid,
        ign: session.ign,
        rank: session.rank,
        role: session.role,
        discord_username: session.discord_username,
        discord_avatar: session.discord_avatar,
      },
      stats: {
        playtime: memberData.playtime || 0,
        wars: memberData.wars || 0,
        raids: memberData.raids || 0,
        shells: memberData.shells || 0,
        contributed: memberData.contributed || 0,
        online: memberData.online || false,
        server: memberData.server || null,
        joined: memberData.joined || null,
        lastJoin: memberData.lastJoin || null,
        guildRank: memberData.rank || null,
      },
      wynnRank,
      customization: {
        gradient,
        backgroundId,
      },
      shellsBalance,
      timeFrames,
      graidEvents,
      totalGraidCompletions,
      totalGraidEventsParticipated: graidEvents.length,
      kickStatus: {
        inDanger: isBelowThreshold,
        onKickList,
        kickListTier,
        weeklyRequirement,
        isNewMember,
      },
    });
  } catch (error) {
    console.error('Profile API error:', error);
    return NextResponse.json({ error: 'Failed to fetch profile data' }, { status: 500 });
  }
}
