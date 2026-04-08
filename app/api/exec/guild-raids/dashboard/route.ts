import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { getRaidShort } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');

    // Build optional date filter
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (dateFrom) {
      conditions.push(`gl.completed_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gl.completed_at <= $${paramIdx++}`);
      params.push(dateTo);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total raids
    const totalResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM graid_logs gl ${whereClause}`, params
    );
    const totalRaids = parseInt(totalResult.rows[0].cnt, 10);

    // Unique participants
    const partResult = await pool.query(
      `SELECT COUNT(DISTINCT glp.ign) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       ${whereClause}`,
      params
    );
    const uniqueParticipants = parseInt(partResult.rows[0].cnt, 10);

    // Most active player
    const topPlayerResult = await pool.query(
      `SELECT glp.ign, COUNT(*) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       ${whereClause}
       GROUP BY glp.ign ORDER BY cnt DESC LIMIT 1`,
      params
    );
    const mostActivePlayer = topPlayerResult.rows.length > 0
      ? { ign: topPlayerResult.rows[0].ign, count: parseInt(topPlayerResult.rows[0].cnt, 10) }
      : null;

    // Raid type distribution
    const typeResult = await pool.query(
      `SELECT gl.raid_type, COUNT(*) as cnt
       FROM graid_logs gl ${whereClause}
       GROUP BY gl.raid_type ORDER BY cnt DESC`,
      params
    );
    const raidTypeDistribution = typeResult.rows.map((r: any) => ({
      type: getRaidShort(r.raid_type),
      fullName: r.raid_type,
      count: parseInt(r.cnt, 10),
    }));

    // Raids over time (per week)
    const timeResult = await pool.query(
      `SELECT DATE_TRUNC('week', gl.completed_at) as week, COUNT(*) as cnt
       FROM graid_logs gl ${whereClause}
       GROUP BY week ORDER BY week`,
      params
    );
    const raidsOverTime = timeResult.rows.map((r: any) => ({
      week: new Date(r.week).toISOString().slice(0, 10),
      count: parseInt(r.cnt, 10),
    }));

    // Top 10 players
    const topPlayersResult = await pool.query(
      `SELECT glp.ign, COUNT(*) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       ${whereClause}
       GROUP BY glp.ign ORDER BY cnt DESC LIMIT 10`,
      params
    );
    const topPlayers = topPlayersResult.rows.map((r: any) => ({
      ign: r.ign,
      count: parseInt(r.cnt, 10),
    }));

    return NextResponse.json({
      data: {
        totalRaids,
        uniqueParticipants,
        mostActivePlayer,
        raidTypeDistribution,
        raidsOverTime,
        topPlayers,
      },
    });
  } catch (error) {
    console.error('Graid log dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
