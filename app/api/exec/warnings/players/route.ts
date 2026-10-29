import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Name suggestions for the add-warning form: linked members plus anyone
 * already on file. Mojang-only names still work, they just aren't suggested.
 */
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (!/^[A-Za-z0-9_]{1,16}$/.test(q)) {
    return NextResponse.json({ players: [] });
  }

  try {
    const pool = getPool();
    // q matches the name charset, so only '_' needs escaping for LIKE
    const prefix = q.toLowerCase().replace(/_/g, '\\_') + '%';
    const result = await pool.query(
      `SELECT ign FROM (
         SELECT ign FROM warning_profiles WHERE LOWER(ign) LIKE $1
         UNION
         SELECT ign FROM discord_links WHERE LOWER(ign) LIKE $1
       ) names
       ORDER BY LENGTH(ign), LOWER(ign)
       LIMIT 8`,
      [prefix]
    );
    return NextResponse.json({ players: result.rows.map(r => r.ign) });
  } catch (error) {
    console.error('Warning player search error:', error);
    return NextResponse.json({ error: 'Failed to search players' }, { status: 500 });
  }
}
