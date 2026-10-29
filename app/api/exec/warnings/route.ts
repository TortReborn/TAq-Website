import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { parseWarningInput, type WarningProfileSummary } from '@/lib/warnings';
import { PlayerLookupError, PlayerNotFoundError, resolveWarningPlayer } from '@/lib/warnings-server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT p.uuid::text AS uuid, p.ign,
              COUNT(w.id)::int AS entry_count,
              COUNT(w.id) FILTER (WHERE w.revoked_at IS NULL)::int AS active_count,
              COUNT(w.id) FILTER (WHERE w.revoked_at IS NULL AND w.kind = 'soft')::int AS soft,
              COUNT(w.id) FILTER (WHERE w.revoked_at IS NULL AND w.kind = 'written')::int AS written,
              COUNT(w.id) FILTER (WHERE w.revoked_at IS NULL AND w.kind = 'formal')::int AS formal,
              COALESCE(BOOL_OR(w.revoked_at IS NULL AND w.kind = 'dishonored_fish'), FALSE) AS dishonored,
              MAX(w.issued_at) AS last_issued_at
       FROM warning_profiles p
       JOIN player_warnings w ON w.uuid = p.uuid
       GROUP BY p.uuid, p.ign
       ORDER BY last_issued_at DESC`
    );

    const profiles: WarningProfileSummary[] = result.rows.map(row => ({
      uuid: row.uuid,
      ign: row.ign,
      counts: {
        total: row.soft + row.written + row.formal,
        soft: row.soft,
        written: row.written,
        formal: row.formal,
        dishonored: row.dishonored,
      },
      entryCount: row.entry_count,
      activeEntryCount: row.active_count,
      lastIssuedAt: row.last_issued_at,
    }));

    return NextResponse.json({ profiles });
  } catch (error) {
    console.error('Warnings fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch warnings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const parsed = parseWarningInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const { ign, kind, rule, notes } = parsed.value;

  const pool = getPool();

  let player;
  try {
    player = await resolveWarningPlayer(pool, ign);
  } catch (error) {
    if (error instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof PlayerLookupError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error('Warning player lookup error:', error);
    return NextResponse.json({ error: 'Failed to look up player' }, { status: 500 });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO warning_profiles (uuid, ign, discord_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (uuid) DO UPDATE
         SET ign = EXCLUDED.ign,
             discord_id = COALESCE(EXCLUDED.discord_id, warning_profiles.discord_id),
             needs_sync = TRUE,
             updated_at = NOW()`,
      [player.uuid, player.ign, player.discordId]
    );
    const inserted = await client.query(
      `INSERT INTO player_warnings (uuid, ign, kind, rule, notes, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [player.uuid, player.ign, kind, rule, notes, session.discord_id]
    );
    await client.query('COMMIT');
    return NextResponse.json({ success: true, id: inserted.rows[0].id, uuid: player.uuid, ign: player.ign });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Warning create error:', error);
    return NextResponse.json({ error: 'Failed to add warning' }, { status: 500 });
  } finally {
    client.release();
  }
}
