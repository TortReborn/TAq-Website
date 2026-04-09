import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { getRaidShort } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

// GET — Per-day raid type distribution for a specific guild raid event
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);
    const eventIdRaw = url.searchParams.get('eventId');
    if (!eventIdRaw) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }
    const eventId = parseInt(eventIdRaw, 10);
    if (Number.isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid eventId' }, { status: 400 });
    }

    const eventResult = await pool.query(
      `SELECT id, title, start_ts, end_ts, active FROM graid_events WHERE id = $1`,
      [eventId]
    );
    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    const event = eventResult.rows[0];

    // Per-day breakdown of raid types completed during the event window
    const dayResult = await pool.query(
      `SELECT DATE(gl.completed_at) as day, gl.raid_type, COUNT(*) as cnt
       FROM graid_logs gl
       WHERE gl.event_id = $1
       GROUP BY day, gl.raid_type
       ORDER BY day`,
      [eventId]
    );

    const dayMap = new Map<string, { date: string; total: number; types: Record<string, number> }>();
    for (const r of dayResult.rows) {
      const date = new Date(r.day).toISOString().slice(0, 10);
      const short = getRaidShort(r.raid_type);
      const cnt = parseInt(r.cnt, 10);
      let entry = dayMap.get(date);
      if (!entry) {
        entry = { date, total: 0, types: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 } };
        dayMap.set(date, entry);
      }
      entry.total += cnt;
      entry.types[short] = (entry.types[short] || 0) + cnt;
    }
    const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate totals by raid type for the event
    const totalsByType: Record<string, number> = { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 };
    let total = 0;
    for (const d of days) {
      total += d.total;
      for (const t of Object.keys(totalsByType)) {
        totalsByType[t] += d.types[t] || 0;
      }
    }

    return NextResponse.json({
      event: {
        id: event.id,
        title: event.title,
        startTs: event.start_ts,
        endTs: event.end_ts,
        active: event.active,
      },
      total,
      totalsByType,
      days,
    });
  } catch (error) {
    console.error('Event distribution error:', error);
    return NextResponse.json({ error: 'Failed to fetch event distribution' }, { status: 500 });
  }
}
