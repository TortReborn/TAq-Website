import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const ticketId = parseInt(id, 10);
    if (isNaN(ticketId)) {
      return NextResponse.json({ error: 'Invalid ticket ID' }, { status: 400 });
    }

    const { body } = await request.json();
    if (!body || typeof body !== 'string' || body.trim().length === 0) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 });
    }

    const pool = getPool();

    // Verify ticket exists
    const ticketCheck = await pool.query(
      `SELECT id FROM tracker_tickets WHERE id = $1`,
      [ticketId]
    );
    if (ticketCheck.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    await pool.query(
      `INSERT INTO tracker_comments (ticket_id, author_id, body) VALUES ($1, $2, $3)`,
      [ticketId, session.discord_id, body.trim()]
    );

    // Update ticket's updated_at
    await pool.query(
      `UPDATE tracker_tickets SET updated_at = NOW() WHERE id = $1`,
      [ticketId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Tracker comment error:', error);
    return NextResponse.json({ error: 'Failed to add comment' }, { status: 500 });
  }
}
