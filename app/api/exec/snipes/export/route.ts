import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { LIST_ORDER_SQL } from '@/lib/snipe-constants';

export const dynamic = 'force-dynamic';

// GET — Export snipe logs as CSV
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);

    const season = url.searchParams.get('season');
    const hq = url.searchParams.get('hq');
    const guildTag = url.searchParams.get('guildTag');
    const ign = url.searchParams.get('ign');
    const diffMin = url.searchParams.get('diffMin');
    const diffMax = url.searchParams.get('diffMax');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') || 'Newest';

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (season === '0') {
      // all-time
    } else if (season) {
      conditions.push(`sl.season = $${paramIdx++}`);
      params.push(parseInt(season, 10));
    } else {
      const seasonRes = await pool.query(`SELECT value FROM snipe_settings WHERE key = 'current_season'`);
      const currentSeason = seasonRes.rows.length > 0 ? parseInt(seasonRes.rows[0].value, 10) : 1;
      conditions.push(`sl.season = $${paramIdx++}`);
      params.push(currentSeason);
    }

    if (hq) { conditions.push(`LOWER(sl.hq) = LOWER($${paramIdx++})`); params.push(hq); }
    if (guildTag) { conditions.push(`UPPER(sl.guild_tag) = UPPER($${paramIdx++})`); params.push(guildTag); }
    if (diffMin) { conditions.push(`sl.difficulty >= $${paramIdx++}`); params.push(parseInt(diffMin, 10)); }
    if (diffMax) { conditions.push(`sl.difficulty <= $${paramIdx++}`); params.push(parseInt(diffMax, 10)); }
    if (dateFrom) { conditions.push(`sl.sniped_at >= $${paramIdx++}`); params.push(dateFrom); }
    if (dateTo) { conditions.push(`sl.sniped_at <= $${paramIdx++}`); params.push(dateTo); }
    if (ign) { conditions.push(`sl.id IN (SELECT snipe_id FROM snipe_participants WHERE LOWER(ign) = LOWER($${paramIdx++}))`); params.push(ign); }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = LIST_ORDER_SQL[sort] || LIST_ORDER_SQL['Newest'];

    // Fetch all matching logs
    const logsResult = await pool.query(
      `SELECT sl.id, sl.hq, sl.difficulty, sl.sniped_at, sl.guild_tag, sl.conns, sl.logged_by, sl.season
       FROM snipe_logs sl
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT 5000`,
      params
    );

    // Fetch participants
    const snipeIds = logsResult.rows.map((r: any) => r.id);
    let participantsBySnipe: Record<number, string> = {};
    if (snipeIds.length > 0) {
      const placeholders = snipeIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const partResult = await pool.query(
        `SELECT snipe_id, ign, role FROM snipe_participants WHERE snipe_id IN (${placeholders}) ORDER BY role, ign`,
        snipeIds
      );
      for (const row of partResult.rows) {
        const existing = participantsBySnipe[row.snipe_id] || '';
        participantsBySnipe[row.snipe_id] = existing ? `${existing}; ${row.ign} (${row.role})` : `${row.ign} (${row.role})`;
      }
    }

    // Build CSV
    const header = 'ID,Date,HQ,Guild,Difficulty,Connections,Season,Participants';
    const rows = logsResult.rows.map((r: any) => {
      const date = new Date(r.sniped_at).toISOString().slice(0, 19).replace('T', ' ');
      const parts = (participantsBySnipe[r.id] || '').replace(/"/g, '""');
      return `${r.id},${date},"${r.hq}",${r.guild_tag},${r.difficulty},${r.conns},${r.season},"${parts}"`;
    });

    const csv = [header, ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="snipe_logs_export.csv"`,
      },
    });
  } catch (error) {
    console.error('Snipe export error:', error);
    return NextResponse.json({ error: 'Failed to export snipe data' }, { status: 500 });
  }
}
