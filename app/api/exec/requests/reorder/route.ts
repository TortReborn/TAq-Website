import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ticketId, status, position } = await request.json();

    if (typeof ticketId !== 'number' || typeof position !== 'number') {
      return NextResponse.json({ error: 'ticketId and position are required' }, { status: 400 });
    }

    const validStatuses = ['untriaged', 'todo', 'blocked', 'in_progress', 'deployed', 'declined', 'archived'];
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const pool = getPool();

    // Get the current ticket
    const ticketResult = await pool.query(
      'SELECT id, status, position FROM tracker_tickets WHERE id = $1',
      [ticketId]
    );
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const ticket = ticketResult.rows[0];
    const targetStatus = status || ticket.status;
    const statusChanged = targetStatus !== ticket.status;

    // Terminal columns sort by resolved_at (TAQ-78); their drag position is
    // meaningless, so only the status changes. Active columns get their
    // positions rewritten in ONE statement -- this used to be one UPDATE per
    // card in the column, sequentially, and a drop into a 70-card column
    // took long enough for the board's background refresh to overtake it.
    const terminal = ['deployed', 'declined', 'archived'].includes(targetStatus);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (statusChanged) {
        await client.query(
          // $1 is used twice; without the casts Postgres cannot deduce one type for it
          // (varchar column vs text literals) and rejects the statement.
          `UPDATE tracker_tickets SET status = $1::text, updated_at = NOW(),
             resolved_at = CASE WHEN $1::text IN ('deployed', 'declined', 'archived') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
           WHERE id = $2`,
          [targetStatus, ticketId]
        );
      }

      if (!terminal) {
        const columnResult = await client.query(
          'SELECT id FROM tracker_tickets WHERE status = $1 AND id != $2 ORDER BY position ASC, created_at DESC',
          [targetStatus, ticketId]
        );
        const ids: number[] = columnResult.rows.map((r: { id: number }) => r.id);
        const clampedPos = Math.max(0, Math.min(position, ids.length));
        ids.splice(clampedPos, 0, ticketId);
        await client.query(
          `UPDATE tracker_tickets AS t SET position = v.pos
             FROM unnest($1::int[], $2::int[]) AS v(id, pos)
            WHERE t.id = v.id`,
          [ids, ids.map((_, i) => i)]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tracker reorder error:', error);
    return NextResponse.json({ error: 'Failed to reorder ticket' }, { status: 500 });
  }
}
