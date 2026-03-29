import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;

  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await request.json();
  } else {
    // sendBeacon may send as text/plain
    body = JSON.parse(await request.text());
  }

  const pool = getPool();

  try {
    if (body.type === 'pageview') {
      const result = await pool.query(
        `INSERT INTO analytics_page_views (discord_id, ign, page_path, referrer, session_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [
          body.discord_id || null,
          body.ign || null,
          body.page_path,
          body.referrer || null,
          body.session_id,
        ]
      );
      return NextResponse.json({ id: result.rows[0].id });
    }

    if (body.type === 'duration') {
      await pool.query(
        `UPDATE analytics_page_views SET duration_ms = $1 WHERE id = $2`,
        [body.duration_ms, body.id]
      );
      return NextResponse.json({ ok: true });
    }

    if (body.type === 'action') {
      await pool.query(
        `INSERT INTO analytics_actions (discord_id, ign, page_path, action_type, action_label, metadata, session_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          body.discord_id || null,
          body.ign || null,
          body.page_path,
          body.action_type,
          body.action_label,
          body.metadata ? JSON.stringify(body.metadata) : null,
          body.session_id || null,
        ]
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  } catch (err) {
    console.error('[analytics/track] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
