import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT de.id, de.title, de.description, de.event_date, de.created_at,
              de.created_by_discord, COALESCE(dl.ign, 'Unknown') AS created_by_ign
       FROM dashboard_events de
       LEFT JOIN discord_links dl ON dl.discord_id = de.created_by_discord
       WHERE de.event_date >= NOW() - INTERVAL '1 day'
       ORDER BY de.event_date ASC`
    );

    return NextResponse.json({
      events: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        eventDate: row.event_date,
        createdAt: row.created_at,
        createdBy: row.created_by_ign,
      })),
    });
  } catch (error) {
    console.error('Dashboard events fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, description, eventDate } = await request.json();
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!eventDate) {
      return NextResponse.json({ error: 'Event date is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO dashboard_events (title, description, event_date, created_by_discord)
       VALUES ($1, $2, $3, $4)`,
      [title.trim(), description?.trim() || null, eventDate, session.discord_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard events add error:', error);
    return NextResponse.json({ error: 'Failed to add event' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, title, description, eventDate } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const pool = getPool();
    const setClauses: string[] = [];
    const values: any[] = [];
    let p = 1;

    if (typeof title === 'string' && title.trim().length > 0) {
      setClauses.push(`title = $${p++}`);
      values.push(title.trim());
    }
    if (description !== undefined) {
      setClauses.push(`description = $${p++}`);
      values.push(description?.trim() || null);
    }
    if (eventDate) {
      setClauses.push(`event_date = $${p++}`);
      values.push(eventDate);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    await pool.query(
      `UPDATE dashboard_events SET ${setClauses.join(', ')} WHERE id = $${p}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard events update error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(`DELETE FROM dashboard_events WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard events delete error:', error);
    return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
  }
}
