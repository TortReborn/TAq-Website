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
      `SELECT mn.uuid, mn.note, mn.updated_at,
              COALESCE(dl.ign, 'Unknown') AS updated_by_ign
       FROM member_notes mn
       LEFT JOIN discord_links dl ON dl.discord_id = mn.updated_by_discord`
    );

    const notes: Record<string, { note: string; updatedAt: string; updatedBy: string }> = {};
    for (const row of result.rows) {
      notes[row.uuid] = { note: row.note, updatedAt: row.updated_at, updatedBy: row.updated_by_ign };
    }

    return NextResponse.json({ notes });
  } catch (error) {
    console.error('Member notes fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, note } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'uuid is required' }, { status: 400 });
    }
    if (!note || typeof note !== 'string' || note.trim().length === 0) {
      return NextResponse.json({ error: 'Note text is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO member_notes (uuid, note, updated_by_discord, updated_at)
       VALUES ($1::uuid, $2, $3, NOW())
       ON CONFLICT (uuid) DO UPDATE SET
         note = EXCLUDED.note,
         updated_by_discord = EXCLUDED.updated_by_discord,
         updated_at = NOW()`,
      [uuid, note.trim(), session.discord_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Member notes save error:', error);
    return NextResponse.json({ error: 'Failed to save note' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'uuid is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(`DELETE FROM member_notes WHERE uuid = $1::uuid`, [uuid]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Member notes delete error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
