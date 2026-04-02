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

    const validStatuses = ['untriaged', 'todo', 'in_progress', 'deployed', 'declined'];
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

    // Get all tickets in the target column ordered by position
    const columnResult = await pool.query(
      'SELECT id, position FROM tracker_tickets WHERE status = $1 AND id != $2 ORDER BY position ASC, created_at DESC',
      [targetStatus, ticketId]
    );

    // Build new position order: insert the ticket at the desired index
    const ids = columnResult.rows.map((r: { id: number }) => r.id);
    const clampedPos = Math.max(0, Math.min(position, ids.length));
    ids.splice(clampedPos, 0, ticketId);

    // Update all positions in a single transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update moved ticket's status if it changed
      if (targetStatus !== ticket.status) {
        await client.query(
          'UPDATE tracker_tickets SET status = $1, updated_at = NOW() WHERE id = $2',
          [targetStatus, ticketId]
        );
      }

      // Update positions for all tickets in this column
      for (let i = 0; i < ids.length; i++) {
        await client.query(
          'UPDATE tracker_tickets SET position = $1 WHERE id = $2',
          [i, ids[i]]
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
