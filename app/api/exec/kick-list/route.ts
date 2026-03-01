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

    // Fetch guild member UUIDs and auto-remove kicked players from the kick list
    const guildDataResult = await pool.query(
      `SELECT data->'members' as members FROM cache_entries WHERE cache_key = 'guildData'`
    );
    const guildMembers: { uuid: string }[] = guildDataResult.rows[0]?.members ?? [];
    const guildUUIDs = new Set(guildMembers.map(m => m.uuid));

    // Only auto-remove if we have a reasonably complete member list (120+)
    // to prevent mass-deletion when cached data is stale/incomplete
    if (guildUUIDs.size >= 120) {
      await pool.query(
        `DELETE FROM kick_list WHERE uuid != ALL($1::varchar[])`,
        [Array.from(guildUUIDs)]
      );
    }

    const [result, lastUpdatedResult, pendingJoinResult] = await Promise.all([
      pool.query(
        `SELECT uuid, ign, tier, added_by, created_at
         FROM kick_list
         ORDER BY tier ASC, created_at ASC`
      ),
      pool.query(
        `SELECT created_at, added_by FROM kick_list ORDER BY created_at DESC LIMIT 1`
      ),
      pool.query(
        `SELECT COUNT(*) as count FROM applications a
         JOIN discord_links dl ON dl.discord_id = CAST(a.discord_id AS BIGINT)
         WHERE a.status = 'accepted'
           AND a.application_type = 'guild'
           AND dl.linked = FALSE`
      ),
    ]);

    const lastRow = lastUpdatedResult.rows[0] ?? null;
    const pendingJoins = parseInt(pendingJoinResult.rows[0]?.count || '0', 10);
    const memberCount = guildUUIDs.size;

    return NextResponse.json({
      entries: result.rows.map(row => ({
        uuid: row.uuid,
        ign: row.ign,
        tier: row.tier,
        addedBy: row.added_by,
        createdAt: row.created_at,
      })),
      lastUpdated: lastRow?.created_at || null,
      lastUpdatedBy: lastRow?.added_by || null,
      memberCount,
      pendingJoins,
    });
  } catch (error) {
    console.error('Kick list fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch kick list' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, ign, tier } = await request.json();

    if (!uuid || !ign || ![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO kick_list (uuid, ign, tier, added_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (uuid) DO UPDATE SET tier = $3, ign = $2, added_by = $4, created_at = NOW()`,
      [uuid, ign, tier, session.discord_username]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kick list add error:', error);
    return NextResponse.json(
      { error: 'Failed to add to kick list' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid } = await request.json();

    if (!uuid) {
      return NextResponse.json({ error: 'UUID required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(`DELETE FROM kick_list WHERE uuid = $1`, [uuid]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kick list remove error:', error);
    return NextResponse.json(
      { error: 'Failed to remove from kick list' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, tier } = await request.json();

    if (!uuid || ![1, 2, 3].includes(tier)) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `UPDATE kick_list SET tier = $1, created_at = NOW() WHERE uuid = $2`,
      [tier, uuid]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Kick list update error:', error);
    return NextResponse.json(
      { error: 'Failed to update kick list' },
      { status: 500 }
    );
  }
}
