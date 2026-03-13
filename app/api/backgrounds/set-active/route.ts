import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { backgroundId } = await request.json();

    if (backgroundId == null || typeof backgroundId !== 'number') {
      return NextResponse.json({ error: 'Missing backgroundId' }, { status: 400 });
    }

    const pool = getPool();

    // ID 0 (default) is always allowed
    if (backgroundId !== 0) {
      const custResult = await pool.query(
        `SELECT owned FROM profile_customization WHERE "user" = $1`,
        [session.discord_id]
      );
      const ownedArr: number[] = custResult.rows[0]?.owned ?? [];
      if (!ownedArr.includes(backgroundId)) {
        return NextResponse.json({ error: 'Background not owned' }, { status: 400 });
      }
    }

    // UPSERT active background
    await pool.query(
      `INSERT INTO profile_customization ("user", background, owned)
       VALUES ($1, $2, '[]'::jsonb)
       ON CONFLICT ("user") DO UPDATE SET background = $2`,
      [session.discord_id, backgroundId]
    );

    return NextResponse.json({ success: true, activeId: backgroundId });
  } catch (error) {
    console.error('Set active background error:', error);
    return NextResponse.json({ error: 'Failed to set background' }, { status: 500 });
  }
}
