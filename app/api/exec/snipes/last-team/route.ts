import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET — Participants of the requesting user's most recently logged snipe
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    // Latest by id (creation order) — sniped_at can be backdated
    const result = await pool.query(
      `SELECT sp.ign, sp.role
       FROM snipe_participants sp
       WHERE sp.snipe_id = (
         SELECT id FROM snipe_logs WHERE logged_by = $1 ORDER BY id DESC LIMIT 1
       )
       ORDER BY CASE sp.role WHEN 'Tank' THEN 0 WHEN 'DPS' THEN 1 ELSE 2 END, sp.ign`,
      [session.discord_id]
    );

    return NextResponse.json({ participants: result.rows });
  } catch (error) {
    console.error('Last team fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch last team' }, { status: 500 });
  }
}
