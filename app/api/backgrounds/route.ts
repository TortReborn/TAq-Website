import { NextRequest, NextResponse } from 'next/server';
import { requireGuildSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireGuildSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    const [backgroundsResult, customizationResult, shellsResult] = await Promise.all([
      pool.query(
        `SELECT id, name, description, price FROM profile_backgrounds WHERE public = true ORDER BY price ASC, id ASC`
      ),
      pool.query(
        `SELECT background, owned FROM profile_customization WHERE "user" = $1`,
        [session.discord_id]
      ),
      pool.query(
        `SELECT balance FROM shells WHERE "user" = $1`,
        [session.discord_id]
      ),
    ]);

    const customization = customizationResult.rows[0];
    const ownedRaw: number[] = customization?.owned ?? [];
    const owned = ownedRaw.includes(0) ? ownedRaw : [0, ...ownedRaw];
    const activeId: number = customization?.background ?? 0;
    const shellsBalance: number = shellsResult.rows[0]?.balance ?? 0;

    const backgrounds = backgroundsResult.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      description: row.description || '',
      price: row.price,
    }));

    return NextResponse.json({ backgrounds, owned, activeId, shellsBalance });
  } catch (error) {
    console.error('Backgrounds fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch backgrounds' }, { status: 500 });
  }
}
