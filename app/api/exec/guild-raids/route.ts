import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { LIST_ORDER_SQL } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

// GET — List graid logs with filtering and pagination
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '25', 10)));
    const raidType = url.searchParams.get('raidType');
    const ign = url.searchParams.get('ign');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') || 'Newest';

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (raidType) {
      if (raidType === 'Unknown') {
        conditions.push(`gl.raid_type IS NULL`);
      } else {
        conditions.push(`gl.raid_type = $${paramIdx++}`);
        params.push(raidType);
      }
    }
    if (dateFrom) {
      conditions.push(`gl.completed_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gl.completed_at <= $${paramIdx++}`);
      params.push(dateTo);
    }
    if (ign) {
      conditions.push(`gl.id IN (SELECT log_id FROM graid_log_participants WHERE LOWER(ign) = LOWER($${paramIdx++}))`);
      params.push(ign);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = LIST_ORDER_SQL[sort] || LIST_ORDER_SQL['Newest'];

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM graid_logs gl ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const offset = (page - 1) * perPage;
    const logsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_logs gl
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, perPage, offset]
    );

    const logIds = logsResult.rows.map((r: any) => r.id);
    let participantsByLog: Record<number, { ign: string; uuid: string | null }[]> = {};

    if (logIds.length > 0) {
      const placeholders = logIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const partResult = await pool.query(
        `SELECT log_id, ign, uuid FROM graid_log_participants WHERE log_id IN (${placeholders}) ORDER BY ign`,
        logIds
      );
      for (const row of partResult.rows) {
        if (!participantsByLog[row.log_id]) participantsByLog[row.log_id] = [];
        participantsByLog[row.log_id].push({ ign: row.ign, uuid: row.uuid });
      }
    }

    const logs = logsResult.rows.map((r: any) => ({
      id: r.id,
      raidType: r.raid_type,
      completedAt: r.completed_at,
      participants: participantsByLog[r.id] || [],
    }));

    return NextResponse.json({ logs, total, page, perPage });
  } catch (error) {
    console.error('Graid log list error:', error);
    return NextResponse.json({ error: 'Failed to fetch graid logs' }, { status: 500 });
  }
}
