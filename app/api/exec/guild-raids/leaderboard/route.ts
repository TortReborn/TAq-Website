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
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const isDateFiltered = !!(dateFrom || dateTo);

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (dateFrom) { conditions.push(`gl.completed_at >= $${paramIdx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`gl.completed_at <= $${paramIdx++}`); params.push(dateTo); }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // UUID-first aggregation with display name from discord_links
    const result = await pool.query(
      `SELECT COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid, gl.raid_type
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       ${whereClause}`,
      params
    );

    // Aggregate per UUID
    const playerMap = new Map<string, {
      displayName: string;
      total: number;
      typeCounts: Record<string, number>;
    }>();

    for (const row of result.rows) {
      const key = row.uuid || row.display_name; // fall back to IGN for NULL uuid
      let data = playerMap.get(key);
      if (!data) {
        data = { displayName: row.display_name, total: 0, typeCounts: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, TWP: 0, Unknown: 0 } };
        playerMap.set(key, data);
      }
      data.total++;
      const short = getRaidShort(row.raid_type);
      data.typeCounts[short] = (data.typeCounts[short] || 0) + 1;
    }

    // Apply offsets (only when NOT date-filtered)
    if (!isDateFiltered) {
      const offsetResult = await pool.query(`SELECT uuid, raid_offset FROM graid_raid_offsets`);
      for (const r of offsetResult.rows) {
        const key = String(r.uuid);
        const data = playerMap.get(key);
        if (data) {
          data.total += r.raid_offset;
        } else {
          // Player has offset but no logged raids — get display name
          const dlResult = await pool.query(`SELECT ign FROM discord_links WHERE uuid = $1`, [r.uuid]);
          const name = dlResult.rows.length > 0 ? dlResult.rows[0].ign : key;
          playerMap.set(key, {
            displayName: name,
            total: r.raid_offset,
            typeCounts: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, TWP: 0, Unknown: 0 },
          });
        }
      }
    }

    const players = Array.from(playerMap.values()).map(data => ({
      ign: data.displayName,
      total: data.total,
      notg: data.typeCounts.NOTG || 0,
      tcc: data.typeCounts.TCC || 0,
      tna: data.typeCounts.TNA || 0,
      nol: data.typeCounts.NOL || 0,
      twp: data.typeCounts.TWP || 0,
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
    } else if (sortKey.includes('twp')) {
      players.sort((a, b) => b.twp - a.twp || b.total - a.total);
    } else {
      players.sort((a, b) => b.total - a.total);
    }

    return NextResponse.json({ players });
  } catch (error) {
    console.error('Graid log leaderboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
