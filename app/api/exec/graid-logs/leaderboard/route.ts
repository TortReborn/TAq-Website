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
    const sort = url.searchParams.get('sort') || 'Total Raids';

    const result = await pool.query(
      `SELECT glp.ign, gl.raid_type, gl.completed_at
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       ORDER BY glp.ign, gl.completed_at`
    );

    const playerMap = new Map<string, {
      total: number;
      typeCounts: Record<string, number>;
    }>();

    for (const row of result.rows) {
      let data = playerMap.get(row.ign);
      if (!data) {
        data = { total: 0, typeCounts: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 } };
        playerMap.set(row.ign, data);
      }
      data.total++;
      const short = getRaidShort(row.raid_type);
      data.typeCounts[short] = (data.typeCounts[short] || 0) + 1;
    }

    const players = Array.from(playerMap.entries()).map(([ign, data]) => ({
      ign,
      total: data.total,
      notg: data.typeCounts.NOTG || 0,
      tcc: data.typeCounts.TCC || 0,
      tna: data.typeCounts.TNA || 0,
      nol: data.typeCounts.NOL || 0,
      unknown: data.typeCounts.Unknown || 0,
    }));

    const sortKey = sort.toLowerCase();
    if (sortKey.includes('notg')) {
      players.sort((a, b) => b.notg - a.notg || b.total - a.total);
    } else if (sortKey.includes('tcc')) {
      players.sort((a, b) => b.tcc - a.tcc || b.total - a.total);
    } else if (sortKey.includes('tna')) {
      players.sort((a, b) => b.tna - a.tna || b.total - a.total);
    } else if (sortKey.includes('nol')) {
      players.sort((a, b) => b.nol - a.nol || b.total - a.total);
    } else {
      players.sort((a, b) => b.total - a.total);
    }

    return NextResponse.json({ players });
  } catch (error) {
    console.error('Graid log leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
