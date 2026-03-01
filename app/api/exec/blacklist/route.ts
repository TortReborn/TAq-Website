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
      `SELECT uuid, ign, reason, created_at FROM blacklist ORDER BY created_at DESC`
    );

    return NextResponse.json({
      entries: result.rows.map(row => ({
        uuid: row.uuid,
        ign: row.ign,
        reason: row.reason || null,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Blacklist fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch blacklist' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ign, reason } = await request.json();
    if (!ign || typeof ign !== 'string' || ign.trim().length === 0) {
      return NextResponse.json({ error: 'IGN is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO blacklist (uuid, ign, reason)
       VALUES (gen_random_uuid(), $1, $2)
       ON CONFLICT (ign) DO UPDATE SET reason = $2`,
      [ign.trim(), reason?.trim() || null]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blacklist add error:', error);
    return NextResponse.json({ error: 'Failed to add to blacklist' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ign, reason } = await request.json();
    if (!ign) {
      return NextResponse.json({ error: 'IGN is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `UPDATE blacklist SET reason = $1 WHERE ign = $2`,
      [reason?.trim() || null, ign]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blacklist edit error:', error);
    return NextResponse.json({ error: 'Failed to update reason' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { ign } = await request.json();
    if (!ign) {
      return NextResponse.json({ error: 'IGN is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(`DELETE FROM blacklist WHERE ign = $1`, [ign]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Blacklist remove error:', error);
    return NextResponse.json({ error: 'Failed to remove from blacklist' }, { status: 500 });
  }
}
