import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { NOTES_MAX, REVOKE_REASON_MAX } from '@/lib/warnings';

export const dynamic = 'force-dynamic';

/**
 * Edit notes, revoke, or restore an entry. Rule and kind are fixed once
 * posted: to change them, revoke the entry and add a corrected one.
 *
 * Body is one of:
 *   { notes: string }
 *   { action: 'revoke', reason: string }
 *   { action: 'restore' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const warningId = parseInt(id, 10);
  if (isNaN(warningId)) {
    return NextResponse.json({ error: 'Invalid warning ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  let sql: string;
  let values: unknown[];

  if (body?.action === 'revoke') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!reason) {
      return NextResponse.json({ error: 'Say why it is being revoked' }, { status: 400 });
    }
    if (reason.length > REVOKE_REASON_MAX) {
      return NextResponse.json({ error: `Reason must be ${REVOKE_REASON_MAX} characters or fewer` }, { status: 400 });
    }
    sql = `UPDATE player_warnings
           SET revoked_at = NOW(), revoked_by = $2, revoke_reason = $3, updated_at = NOW()
           WHERE id = $1 AND revoked_at IS NULL
           RETURNING uuid`;
    values = [warningId, session.discord_id, reason];
  } else if (body?.action === 'restore') {
    sql = `UPDATE player_warnings
           SET revoked_at = NULL, revoked_by = NULL, revoke_reason = NULL, updated_at = NOW()
           WHERE id = $1 AND revoked_at IS NOT NULL
           RETURNING uuid`;
    values = [warningId];
  } else if (typeof body?.notes === 'string') {
    const notes = body.notes.trim();
    if (notes.length > NOTES_MAX) {
      return NextResponse.json({ error: `Notes must be ${NOTES_MAX} characters or fewer` }, { status: 400 });
    }
    sql = `UPDATE player_warnings SET notes = $2, updated_at = NOW() WHERE id = $1 RETURNING uuid`;
    values = [warningId, notes || null];
  } else {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(sql, values);
    if (result.rows.length === 0) {
      // Either the id is unknown or the entry was already in the requested state.
      const exists = await pool.query('SELECT 1 FROM player_warnings WHERE id = $1', [warningId]);
      return exists.rows.length === 0
        ? NextResponse.json({ error: 'Warning not found' }, { status: 404 })
        : NextResponse.json({ error: 'Someone already changed this warning. Refresh to see it.' }, { status: 409 });
    }
    await pool.query(
      'UPDATE warning_profiles SET needs_sync = TRUE, updated_at = NOW() WHERE uuid = $1',
      [result.rows[0].uuid]
    );
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Warning update error:', error);
    return NextResponse.json({ error: 'Failed to update warning' }, { status: 500 });
  }
}
