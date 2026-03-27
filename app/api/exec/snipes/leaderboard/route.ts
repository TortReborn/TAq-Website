import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Compute streak from an array of date strings (sorted ASC)
function computeStreaks(dates: string[]): { best: number; current: number } {
  if (dates.length === 0) return { best: 0, current: 0 };

  const daySet = new Set<string>();
  for (const d of dates) {
    daySet.add(new Date(d).toISOString().slice(0, 10));
  }
  const sortedDays = Array.from(daySet).sort();

  let best = 1;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const prev = new Date(sortedDays[i - 1]);
    const curr = new Date(sortedDays[i]);
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 1) {
      run++;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }
  if (run > best) best = run;

  // Current streak: must include today or yesterday
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let current = 0;
  const last = sortedDays[sortedDays.length - 1];
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const prev = new Date(sortedDays[i]);
      const curr = new Date(sortedDays[i + 1]);
      const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
      if (diff === 1) current++;
      else break;
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
    const sort = url.searchParams.get('sort') || 'Total Snipes';
    const seasonParam = url.searchParams.get('season');

    // Build season filter
    let seasonClause = '';
    const params: any[] = [];
    if (seasonParam === '0') {
      // all-time
    } else if (seasonParam) {
      params.push(parseInt(seasonParam, 10));
      seasonClause = `WHERE sl.season = $1`;
    } else {
      const seasonRes = await pool.query(`SELECT value FROM snipe_settings WHERE key = 'current_season'`);
      const currentSeason = seasonRes.rows.length > 0 ? parseInt(seasonRes.rows[0].value, 10) : 1;
      params.push(currentSeason);
      seasonClause = `WHERE sl.season = $1`;
    }

    // Get all participants with their snipe data
    const result = await pool.query(
      `SELECT sp.ign, sl.difficulty, sl.hq, sl.sniped_at
       FROM snipe_participants sp
       JOIN snipe_logs sl ON sp.snipe_id = sl.id
       ${seasonClause}
       ORDER BY sp.ign, sl.sniped_at`,
      params
    );

    // Aggregate per player
    const playerMap = new Map<string, { total: number; bestDiff: number; bestHq: string; dates: string[] }>();
    for (const row of result.rows) {
      let data = playerMap.get(row.ign);
      if (!data) {
        data = { total: 0, bestDiff: 0, bestHq: '', dates: [] };
        playerMap.set(row.ign, data);
      }
      data.total++;
      if (row.difficulty > data.bestDiff) {
        data.bestDiff = row.difficulty;
        data.bestHq = row.hq;
      }
      data.dates.push(row.sniped_at);
    }

    const players = Array.from(playerMap.entries()).map(([ign, data]) => {
      const streaks = computeStreaks(data.dates);
      return {
        ign,
        total: data.total,
        bestDifficulty: data.bestDiff,
        bestHq: data.bestHq,
        bestStreak: streaks.best,
        currentStreak: streaks.current,
      };
    });

    // Sort
    switch (sort) {
      case 'Personal Best':
        players.sort((a, b) => b.bestDifficulty - a.bestDifficulty || b.total - a.total);
        break;
      case 'Best Streak':
        players.sort((a, b) => b.bestStreak - a.bestStreak || b.total - a.total);
        break;
      case 'Current Streak':
        players.sort((a, b) => b.currentStreak - a.currentStreak || b.total - a.total);
        break;
      default: // Total Snipes
        players.sort((a, b) => b.total - a.total || b.bestDifficulty - a.bestDifficulty);
    }

    return NextResponse.json({ players });
  } catch (error) {
    console.error('Snipe leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
