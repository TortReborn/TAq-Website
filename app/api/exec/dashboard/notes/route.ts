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
      `SELECT dn.id, dn.content, dn.completed, dn.created_at, dn.created_by_discord,
              COALESCE(dl.ign, 'Unknown') AS created_by_ign
       FROM dashboard_notes dn
       LEFT JOIN discord_links dl ON dl.discord_id = dn.created_by_discord
       ORDER BY dn.completed ASC, dn.created_at DESC`
    );

    return NextResponse.json({
      notes: result.rows.map(row => ({
        id: row.id,
        content: row.content,
        completed: row.completed,
        createdAt: row.created_at,
        createdBy: row.created_by_ign,
      })),
    });
  } catch (error) {
    console.error('Dashboard notes fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { content } = await request.json();
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO dashboard_notes (content, created_by_discord) VALUES ($1, $2)`,
      [content.trim(), session.discord_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard notes add error:', error);
    return NextResponse.json({ error: 'Failed to add note' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, completed, content } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const pool = getPool();
    if (typeof completed === 'boolean') {
      await pool.query(
        `UPDATE dashboard_notes SET completed = $1 WHERE id = $2`,
        [completed, id]
      );
    }
    if (typeof content === 'string' && content.trim().length > 0) {
      await pool.query(
        `UPDATE dashboard_notes SET content = $1 WHERE id = $2`,
        [content.trim(), id]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard notes toggle error:', error);
    return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
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
    await pool.query(`DELETE FROM dashboard_notes WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Dashboard notes delete error:', error);
    return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
  }
}
