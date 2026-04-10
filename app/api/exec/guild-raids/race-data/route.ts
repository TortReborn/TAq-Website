import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RAID_SHORT_TO_FULL } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

// GET — Returns all raid logs (no pagination) for the player race animation.
// Filters: dateFrom, dateTo, raidTypes (CSV of NOTG/TCC/TNA/NOL/TWP/Unknown).
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
    const raidTypesParam = url.searchParams.get('raidTypes');

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (dateFrom) {
      conditions.push(`gl.completed_at >= $${idx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gl.completed_at <= $${idx++}`);
      params.push(dateTo);
    }

    if (raidTypesParam) {
      const types = raidTypesParam.split(',').map(t => t.trim()).filter(Boolean);
      const fullTypes: string[] = [];
      let includeUnknown = false;
      for (const t of types) {
        if (t === 'Unknown') includeUnknown = true;
        else if (RAID_SHORT_TO_FULL[t]) fullTypes.push(RAID_SHORT_TO_FULL[t]);
      }
      if (fullTypes.length > 0 && includeUnknown) {
        conditions.push(`(gl.raid_type IS NULL OR gl.raid_type = ANY($${idx++}::text[]))`);
        params.push(fullTypes);
      } else if (fullTypes.length > 0) {
        conditions.push(`gl.raid_type = ANY($${idx++}::text[])`);
        params.push(fullTypes);
      } else if (includeUnknown) {
        conditions.push(`gl.raid_type IS NULL`);
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'ign', COALESCE(dl.ign, glp.ign),
                    'uuid', glp.uuid
                  )
                ) FILTER (WHERE glp.log_id IS NOT NULL),
                '[]'::json
              ) AS participants
       FROM graid_logs gl
       LEFT JOIN graid_log_participants glp ON glp.log_id = gl.id
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       ${where}
       GROUP BY gl.id
       ORDER BY gl.completed_at ASC`,
      params
    );

    return NextResponse.json({
      raids: result.rows.map((r: any) => ({
        id: r.id,
        raidType: r.raid_type,
        completedAt: r.completed_at,
        participants: r.participants || [],
      })),
    });
  } catch (error) {
    console.error('Race data error:', error);
    return NextResponse.json({ error: 'Failed to fetch race data' }, { status: 500 });
  }
}