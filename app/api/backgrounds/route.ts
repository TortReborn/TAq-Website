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
    const activeId: number = customization?.background ?? 0;
    const shellsBalance: number = shellsResult.rows[0]?.balance ?? 0;

    // Always include default (id 1) and the user's active background as owned
    const owned = [...new Set([1, ...ownedRaw, ...(activeId > 0 ? [activeId] : [])])];

    const publicIds = new Set(backgroundsResult.rows.map((row: any) => row.id));

    // Find any owned/active backgrounds that aren't in the public list (force-unlocked or custom)
    const missingOwnedIds = owned.filter(id => !publicIds.has(id));
    let extraBackgrounds: any[] = [];
    if (missingOwnedIds.length > 0) {
      const extraResult = await pool.query(
        `SELECT id, name, description, price FROM profile_backgrounds WHERE id = ANY($1)`,
        [missingOwnedIds]
      );
      extraBackgrounds = extraResult.rows;
    }

    const allRows = [...backgroundsResult.rows, ...extraBackgrounds];
    const backgrounds = allRows.map((row: any) => ({
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
