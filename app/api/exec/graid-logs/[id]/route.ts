import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — Single graid log detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const pool = getPool();
    const logId = parseInt(id, 10);

    const logResult = await pool.query(
      `SELECT gl.id, gl.event_id, gl.raid_type, gl.completed_at, ge.title as event_title
       FROM graid_logs gl
       LEFT JOIN graid_events ge ON gl.event_id = ge.id
       WHERE gl.id = $1`,
      [logId]
    );

    if (logResult.rows.length === 0) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    const row = logResult.rows[0];
    const partResult = await pool.query(
      `SELECT ign, uuid FROM graid_log_participants WHERE log_id = $1 ORDER BY ign`,
      [logId]
    );

    return NextResponse.json({
      log: {
        id: row.id,
        eventId: row.event_id,
        eventTitle: row.event_title,
        raidType: row.raid_type,
        completedAt: row.completed_at,
        participants: partResult.rows.map((r: any) => ({ ign: r.ign, uuid: r.uuid })),
      },
    });
  } catch (error) {
    console.error('Graid log detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch graid log' }, { status: 500 });
  }
}

// DELETE — Remove a graid log
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const pool = getPool();
    const logId = parseInt(id, 10);

    const result = await pool.query(
      `DELETE FROM graid_logs WHERE id = $1 RETURNING id`,
      [logId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Log not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, id: logId });
  } catch (error) {
    console.error('Graid log delete error:', error);
    return NextResponse.json({ error: 'Failed to delete graid log' }, { status: 500 });
  }
}
