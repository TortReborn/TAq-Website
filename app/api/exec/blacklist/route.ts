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

    const trimmedIgn = ign.trim();

    // Look up the real Minecraft UUID via Mojang API
    const mojangRes = await fetch(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(trimmedIgn)}`,
      { signal: AbortSignal.timeout(8000) }
    );

    if (mojangRes.status === 404 || mojangRes.status === 204) {
      return NextResponse.json({ error: 'Player not found' }, { status: 400 });
    }

    if (!mojangRes.ok) {
      return NextResponse.json({ error: 'Could not verify player. Try again later.' }, { status: 502 });
    }

    const mojangData = await mojangRes.json();
    const username: string = mojangData.name;
    const rawUuid: string = mojangData.id;
    const uuid = [
      rawUuid.slice(0, 8),
      rawUuid.slice(8, 12),
      rawUuid.slice(12, 16),
      rawUuid.slice(16, 20),
      rawUuid.slice(20),
    ].join('-');

    const pool = getPool();
    await pool.query(
      `INSERT INTO blacklist (uuid, ign, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (uuid) DO UPDATE SET ign = EXCLUDED.ign, reason = EXCLUDED.reason`,
      [uuid, username, reason?.trim() || null]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return NextResponse.json({ error: 'Player lookup timed out. Try again.' }, { status: 504 });
    }
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
