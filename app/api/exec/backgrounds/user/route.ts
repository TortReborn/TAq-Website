import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { warmCache } from '@/lib/background-cache';

export const dynamic = 'force-dynamic';

// GET — Fetch a specific user's background customization
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const discordId = request.nextUrl.searchParams.get('discordId');
  if (!discordId) {
    return NextResponse.json({ error: 'Missing discordId parameter' }, { status: 400 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT background, owned, gradient FROM profile_customization WHERE "user" = $1`,
      [discordId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ background: 0, owned: [], gradient: null });
    }

    const row = result.rows[0];
    const bg = row.background ?? 0;
    const owned: number[] = row.owned ?? [];

    // Warm the background image cache for the user's backgrounds
    const idsToWarm = [...new Set([...(bg > 0 ? [bg] : []), ...owned])];
    warmCache(idsToWarm).catch(() => {});

    return NextResponse.json({
      background: bg,
      owned,
      gradient: row.gradient ?? null,
    });
  } catch (error) {
    console.error('User customization fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch user customization' }, { status: 500 });
  }
}
