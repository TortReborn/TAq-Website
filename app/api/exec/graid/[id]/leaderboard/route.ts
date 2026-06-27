import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { fetchEventById } from '@/lib/graid';

export const dynamic = 'force-dynamic';

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
    const eventId = parseInt(id, 10);
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const { event, rows } = await fetchEventById(eventId);
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event, rows });
  } catch (error) {
    console.error('Graid leaderboard fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const eventId = parseInt(id, 10);
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const { uuid, paid } = await request.json();
    if (!uuid || typeof paid !== 'boolean') {
      return NextResponse.json({ error: 'uuid and paid (boolean) are required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO graid_event_totals (event_id, uuid, total, paid)
       VALUES ($1, $2, 0, $3)
       ON CONFLICT (event_id, uuid)
       DO UPDATE SET paid = EXCLUDED.paid, last_updated = NOW()`,
      [eventId, uuid, paid]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Graid paid toggle error:', error);
    return NextResponse.json({ error: 'Failed to update paid status' }, { status: 500 });
  }
}
