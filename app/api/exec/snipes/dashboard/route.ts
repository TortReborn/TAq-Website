import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);
    const seasonParam = url.searchParams.get('season');

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

    // Total snipes
    const totalResult = await pool.query(`SELECT COUNT(*) as cnt FROM snipe_logs sl ${seasonClause}`, params);
    const totalSnipes = parseInt(totalResult.rows[0].cnt, 10);

    // Unique participants
    const partResult = await pool.query(
      `SELECT COUNT(DISTINCT sp.ign) as cnt
       FROM snipe_participants sp
       JOIN snipe_logs sl ON sp.snipe_id = sl.id
       ${seasonClause}`,
      params
    );
    const uniqueParticipants = parseInt(partResult.rows[0].cnt, 10);

    // Most sniped guild
    const guildResult = await pool.query(
      `SELECT sl.guild_tag, COUNT(*) as cnt
       FROM snipe_logs sl ${seasonClause}
       GROUP BY sl.guild_tag ORDER BY cnt DESC LIMIT 1`,
      params
    );
    const mostSnipedGuild = guildResult.rows.length > 0
      ? { tag: guildResult.rows[0].guild_tag, count: parseInt(guildResult.rows[0].cnt, 10) }
      : null;

    // Hardest snipe
    const hardestResult = await pool.query(
      `SELECT sl.id, sl.hq, sl.difficulty, sl.guild_tag
       FROM snipe_logs sl ${seasonClause}
       ORDER BY sl.difficulty DESC LIMIT 1`,
      params
    );
    const hardestSnipe = hardestResult.rows.length > 0
      ? { id: hardestResult.rows[0].id, hq: hardestResult.rows[0].hq, difficulty: hardestResult.rows[0].difficulty, guildTag: hardestResult.rows[0].guild_tag }
      : null;

    // Snipes over time (per week)
    const timeResult = await pool.query(
      `SELECT DATE_TRUNC('week', sl.sniped_at) as week, COUNT(*) as cnt
       FROM snipe_logs sl ${seasonClause}
       GROUP BY week ORDER BY week`,
      params
    );
    const snipesOverTime = timeResult.rows.map((r: any) => ({
      week: new Date(r.week).toISOString().slice(0, 10),
      count: parseInt(r.cnt, 10),
    }));

    // Difficulty distribution (buckets: 0-55, 56-99, 100-119, 120-166, 167-191, 192-201, 202+)
    const buckets = [
      { label: '0-55', min: 0, max: 55 },
      { label: '56-99', min: 56, max: 99 },
      { label: '100-119', min: 100, max: 119 },
      { label: '120-166', min: 120, max: 166 },
      { label: '167-191', min: 167, max: 191 },
      { label: '192-201', min: 192, max: 201 },
      { label: '202+', min: 202, max: 99999 },
    ];
    const diffResult = await pool.query(
      `SELECT sl.difficulty FROM snipe_logs sl ${seasonClause}`,
      params
    );
    const diffDistribution = buckets.map(b => ({
      bucket: b.label,
      count: diffResult.rows.filter((r: any) => r.difficulty >= b.min && r.difficulty <= b.max).length,
    }));

    // Guild breakdown (top 10)
    const guildBreakdownResult = await pool.query(
      `SELECT sl.guild_tag, COUNT(*) as cnt
       FROM snipe_logs sl ${seasonClause}
       GROUP BY sl.guild_tag ORDER BY cnt DESC LIMIT 10`,
      params
    );
    const guildBreakdown = guildBreakdownResult.rows.map((r: any) => ({
      tag: r.guild_tag,
      count: parseInt(r.cnt, 10),
    }));

    // HQ frequency (top 10)
    const hqResult = await pool.query(
      `SELECT sl.hq, COUNT(*) as cnt
       FROM snipe_logs sl ${seasonClause}
       GROUP BY sl.hq ORDER BY cnt DESC LIMIT 10`,
      params
    );
    const hqFrequency = hqResult.rows.map((r: any) => ({
      name: r.hq,
      count: parseInt(r.cnt, 10),
    }));

    // Role distribution
    const roleResult = await pool.query(
      `SELECT sp.role, COUNT(*) as cnt
       FROM snipe_participants sp
       JOIN snipe_logs sl ON sp.snipe_id = sl.id
       ${seasonClause}
       GROUP BY sp.role ORDER BY cnt DESC`,
      params
    );
    const roleDistribution = roleResult.rows.map((r: any) => ({
      role: r.role,
      count: parseInt(r.cnt, 10),
    }));

    // Season comparison
    const seasonCompResult = await pool.query(
      `SELECT season, COUNT(*) as cnt FROM snipe_logs GROUP BY season ORDER BY season`
    );
    const seasonComparison = seasonCompResult.rows.map((r: any) => ({
      season: r.season,
      count: parseInt(r.cnt, 10),
    }));

    return NextResponse.json({
      data: {
        totalSnipes,
        uniqueParticipants,
        mostSnipedGuild,
        hardestSnipe,
        snipesOverTime,
        difficultyDistribution: diffDistribution,
        guildBreakdown,
        hqFrequency,
        roleDistribution,
        seasonComparison,
      },
    });
  } catch (error) {
    console.error('Snipe dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
