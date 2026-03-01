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
      `SELECT art.id, art.topic, art.description, art.submitted_by, art.created_at,
              dl.ign as submitted_by_ign
       FROM agenda_requested_topics art
       LEFT JOIN discord_links dl ON dl.discord_id = art.submitted_by
       ORDER BY art.created_at DESC`
    );

    return NextResponse.json({
      topics: result.rows.map(row => ({
        id: row.id,
        topic: row.topic,
        description: row.description,
        submittedByIgn: row.submitted_by_ign || 'Unknown',
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Agenda requested fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch requested topics' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { topic, description } = await request.json();
    if (!topic || typeof topic !== 'string' || topic.trim().length === 0) {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO agenda_requested_topics (topic, description, submitted_by) VALUES ($1, $2, $3)`,
      [topic.trim(), description?.trim() || null, session.discord_id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Agenda requested add error:', error);
    return NextResponse.json({ error: 'Failed to submit topic' }, { status: 500 });
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
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(`DELETE FROM agenda_requested_topics WHERE id = $1`, [id]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Agenda requested delete error:', error);
    return NextResponse.json({ error: 'Failed to delete topic' }, { status: 500 });
  }
}
