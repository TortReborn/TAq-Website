import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { isDry } from '@/lib/snipe-constants';

export const dynamic = 'force-dynamic';

function computeStreaks(dates: string[]): { best: number; current: number } {
  if (dates.length === 0) return { best: 0, current: 0 };
  const daySet = new Set<string>();
  for (const d of dates) daySet.add(new Date(d).toISOString().slice(0, 10));
  const sortedDays = Array.from(daySet).sort();
  let best = 1, run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000;
    if (diff === 1) { run++; if (run > best) best = run; } else run = 1;
  }
  if (run > best) best = run;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let current = 0;
  const last = sortedDays[sortedDays.length - 1];
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const diff = (new Date(sortedDays[i + 1]).getTime() - new Date(sortedDays[i]).getTime()) / 86400000;
      if (diff === 1) current++; else break;
    }
  }
  return { best, current };
}

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);
    const ign = url.searchParams.get('ign');
    if (!ign) {
      return NextResponse.json({ error: 'Missing ign parameter' }, { status: 400 });
    }

    // Get all snipes for this player
    const snipesResult = await pool.query(
      `SELECT sl.id, sl.hq, sl.difficulty, sl.sniped_at, sl.guild_tag, sl.conns, sl.season, sp.role
       FROM snipe_participants sp
       JOIN snipe_logs sl ON sp.snipe_id = sl.id
       WHERE LOWER(sp.ign) = LOWER($1)
       ORDER BY sl.sniped_at DESC`,
      [ign]
    );

    if (snipesResult.rows.length === 0) {
      return NextResponse.json({ error: `No snipes found for "${ign}"` }, { status: 404 });
    }

    const rows = snipesResult.rows;
    const total = rows.length;
    const dates = rows.map((r: any) => r.sniped_at);
    const streaks = computeStreaks(dates);

    // Best difficulty
    let bestDiff = 0, bestHq = '';
    for (const r of rows) {
      if (r.difficulty > bestDiff) { bestDiff = r.difficulty; bestHq = r.hq; }
    }

    // Ranking
    const rankResult = await pool.query(
      `SELECT sp.ign, COUNT(*) as cnt
       FROM snipe_participants sp
       JOIN snipe_logs sl ON sp.snipe_id = sl.id
       GROUP BY sp.ign
       ORDER BY cnt DESC`
    );
    const ranking = rankResult.rows.findIndex((r: any) => r.ign.toLowerCase() === ign.toLowerCase()) + 1;

    // Unique guilds, HQs
    const uniqueGuilds = new Set(rows.map((r: any) => r.guild_tag)).size;
    const uniqueHqs = new Set(rows.map((r: any) => r.hq)).size;

    // Zero-conn and dry snipes
    const zeroConnSnipes = rows.filter((r: any) => r.conns === 0).length;
    const drySnipes = rows.filter((r: any) => isDry(r.hq, r.conns)).length;

    // First and latest
    const firstSnipe = rows[rows.length - 1].sniped_at;
    const latestSnipe = rows[0].sniped_at;

    // Best day
    const dayCounts: Record<string, number> = {};
    for (const r of rows) {
      const day = new Date(r.sniped_at).toISOString().slice(0, 10);
      dayCounts[day] = (dayCounts[day] || 0) + 1;
    }
    let bestDay = { date: '', count: 0 };
    for (const [date, count] of Object.entries(dayCounts)) {
      if (count > bestDay.count) bestDay = { date, count };
    }

    // Top guilds
    const guildCounts: Record<string, number> = {};
    for (const r of rows) guildCounts[r.guild_tag] = (guildCounts[r.guild_tag] || 0) + 1;
    const topGuilds = Object.entries(guildCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count }));

    // Top HQs
    const hqCounts: Record<string, number> = {};
    for (const r of rows) hqCounts[r.hq] = (hqCounts[r.hq] || 0) + 1;
    const topHqs = Object.entries(hqCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    // Role breakdown
    const roleCounts: Record<string, number> = {};
    for (const r of rows) roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
    const roleBreakdown = Object.entries(roleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => ({ role, count }));

    // Top teammates
    const snipeIds = rows.map((r: any) => r.id);
    const uniqueSnipeIds = [...new Set(snipeIds)];
    let topTeammates: { ign: string; count: number }[] = [];
    if (uniqueSnipeIds.length > 0) {
      const placeholders = uniqueSnipeIds.map((_: any, i: number) => `$${i + 2}`).join(',');
      const tmResult = await pool.query(
        `SELECT ign, COUNT(*) as cnt
         FROM snipe_participants
         WHERE snipe_id IN (${placeholders}) AND LOWER(ign) != LOWER($1)
         GROUP BY ign
         ORDER BY cnt DESC
         LIMIT 10`,
        [ign, ...uniqueSnipeIds]
      );
      topTeammates = tmResult.rows.map((r: any) => ({ ign: r.ign, count: parseInt(r.cnt, 10) }));
    }

    // Duo partners (with best difficulty)
    let duoPartners: { ign: string; count: number; bestDifficulty: number }[] = [];
    if (uniqueSnipeIds.length > 0) {
      const placeholders = uniqueSnipeIds.map((_: any, i: number) => `$${i + 2}`).join(',');
      const duoResult = await pool.query(
        `SELECT sp.ign, COUNT(*) as cnt, MAX(sl.difficulty) as best_diff
         FROM snipe_participants sp
         JOIN snipe_logs sl ON sp.snipe_id = sl.id
         WHERE sp.snipe_id IN (${placeholders}) AND LOWER(sp.ign) != LOWER($1)
         GROUP BY sp.ign
         ORDER BY cnt DESC, best_diff DESC
         LIMIT 10`,
        [ign, ...uniqueSnipeIds]
      );
      duoPartners = duoResult.rows.map((r: any) => ({ ign: r.ign, count: parseInt(r.cnt, 10), bestDifficulty: r.best_diff }));
    }

    // Activity by day of week
    const activityByDay: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const r of rows) {
      const dayName = dayNames[new Date(r.sniped_at).getDay()];
      activityByDay[dayName]++;
    }

    // Recent snipes (last 10) with participants
    const recentIds = uniqueSnipeIds.slice(0, 10);
    let recentSnipes: any[] = [];
    if (recentIds.length > 0) {
      const placeholders = recentIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const recentLogResult = await pool.query(
        `SELECT sl.id, sl.hq, sl.difficulty, sl.sniped_at, sl.guild_tag, sl.conns, sl.season, sl.logged_by
         FROM snipe_logs sl
         WHERE sl.id IN (${placeholders})
         ORDER BY sl.sniped_at DESC`,
        recentIds
      );
      const recentPartResult = await pool.query(
        `SELECT snipe_id, ign, role FROM snipe_participants WHERE snipe_id IN (${placeholders})`,
        recentIds
      );
      const partMap: Record<number, { ign: string; role: string }[]> = {};
      for (const r of recentPartResult.rows) {
        if (!partMap[r.snipe_id]) partMap[r.snipe_id] = [];
        partMap[r.snipe_id].push({ ign: r.ign, role: r.role });
      }
      recentSnipes = recentLogResult.rows.map((r: any) => ({
        id: r.id,
        hq: r.hq,
        difficulty: r.difficulty,
        snipedAt: r.sniped_at,
        guildTag: r.guild_tag,
        conns: r.conns,
        season: r.season,
        loggedBy: r.logged_by,
        participants: partMap[r.id] || [],
      }));
    }

    return NextResponse.json({
      stats: {
        ign: rows[0].ign || ign,
        total,
        bestDifficulty: bestDiff,
        bestHq,
        bestStreak: streaks.best,
        currentStreak: streaks.current,
        ranking,
        firstSnipe,
        latestSnipe,
        uniqueGuilds,
        uniqueHqs,
        zeroConnSnipes,
        drySnipes,
        bestDay,
        topGuilds,
        topHqs,
        topTeammates,
        roleBreakdown,
        recentSnipes,
        duoPartners,
        activityByDay,
      },
    });
  } catch (error) {
    console.error('Snipe stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch player stats' }, { status: 500 });
  }
}
