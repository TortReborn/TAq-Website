import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Hard cap on events per request to bound work and DB write size.
const MAX_EVENTS_PER_REQUEST = 50;

type RawEvent = Record<string, unknown>;

type PageviewRow = {
  discord_id: string | null;
  ign: string | null;
  page_path: string;
  referrer: string | null;
  session_id: string;
  duration_ms: number;
};

type ActionRow = {
  discord_id: string | null;
  ign: string | null;
  page_path: string;
  action_type: string;
  action_label: string;
  metadata: string | null;
  session_id: string | null;
};

function asString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  return v.length > max ? v.slice(0, max) : v;
}

function asInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.max(0, Math.floor(v));
}

function parsePageview(e: RawEvent): PageviewRow | null {
  const page_path = asString(e.page_path, 500);
  const session_id = asString(e.session_id, 64);
  const duration_ms = asInt(e.duration_ms);
  if (!page_path || !session_id || duration_ms === null) return null;
  return {
    discord_id: asString(e.discord_id, 64),
    ign: asString(e.ign, 64),
    page_path,
    referrer: asString(e.referrer, 500),
    session_id,
    duration_ms,
  };
}

function parseAction(e: RawEvent): ActionRow | null {
  const page_path = asString(e.page_path, 500);
  const action_type = asString(e.action_type, 50);
  const action_label = asString(e.action_label, 200);
  if (!page_path || !action_type || !action_label) return null;
  let metadata: string | null = null;
  if (e.metadata && typeof e.metadata === 'object') {
    try {
      metadata = JSON.stringify(e.metadata);
    } catch {
      metadata = null;
    }
  }
  return {
    discord_id: asString(e.discord_id, 64),
    ign: asString(e.ign, 64),
    page_path,
    action_type,
    action_label,
    metadata,
    session_id: asString(e.session_id, 64),
  };
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    const contentType = request.headers.get('content-type') || '';
    const text = contentType.includes('application/json')
      ? await request.text()
      : await request.text();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const rawEvents = Array.isArray(body.events) ? (body.events as RawEvent[]) : null;
  if (!rawEvents || rawEvents.length === 0) {
    return NextResponse.json({ error: 'No events' }, { status: 400 });
  }
  if (rawEvents.length > MAX_EVENTS_PER_REQUEST) {
    return NextResponse.json({ error: 'Too many events' }, { status: 413 });
  }

  const pageviews: PageviewRow[] = [];
  const actions: ActionRow[] = [];
  for (const e of rawEvents) {
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'pageview') {
      const row = parsePageview(e);
      if (row) pageviews.push(row);
    } else if (e.type === 'action') {
      const row = parseAction(e);
      if (row) actions.push(row);
    }
  }

  if (pageviews.length === 0 && actions.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const pool = getPool();

  try {
    if (pageviews.length > 0) {
      const cols = 6;
      const values: unknown[] = [];
      const placeholders = pageviews
        .map((row, i) => {
          const base = i * cols;
          values.push(
            row.discord_id,
            row.ign,
            row.page_path,
            row.referrer,
            row.session_id,
            row.duration_ms,
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
        })
        .join(', ');
      await pool.query(
        `INSERT INTO analytics_page_views
           (discord_id, ign, page_path, referrer, session_id, duration_ms)
         VALUES ${placeholders}`,
        values,
      );
    }

    if (actions.length > 0) {
      const cols = 7;
      const values: unknown[] = [];
      const placeholders = actions
        .map((row, i) => {
          const base = i * cols;
          values.push(
            row.discord_id,
            row.ign,
            row.page_path,
            row.action_type,
            row.action_label,
            row.metadata,
            row.session_id,
          );
          return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
        })
        .join(', ');
      await pool.query(
        `INSERT INTO analytics_actions
           (discord_id, ign, page_path, action_type, action_label, metadata, session_id)
         VALUES ${placeholders}`,
        values,
      );
    }

    return NextResponse.json({
      ok: true,
      inserted: pageviews.length + actions.length,
    });
  } catch (err) {
    console.error('[analytics/track] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
