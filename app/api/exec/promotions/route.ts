import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RANK_HIERARCHY } from '@/lib/rank-constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    const [guildDataResult, pendingResult, historyResult] = await Promise.all([
      // Guild members with discord rank
      pool.query(
        `SELECT data->'members' as members FROM cache_entries WHERE cache_key = 'guildData'`
      ),
      // Pending queue
      pool.query(
        `SELECT id, uuid, ign, current_rank, new_rank, action_type,
                queued_by_ign, created_at, status, completed_at, error_message
         FROM promotion_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      ),
      // Recent history
      pool.query(
        `SELECT id, uuid, ign, current_rank, new_rank, action_type,
                queued_by_ign, created_at, status, completed_at, error_message
         FROM promotion_queue
         WHERE status IN ('completed', 'failed')
         ORDER BY completed_at DESC
         LIMIT 50`
      ),
    ]);

    // Get guild member UUIDs and enrich with discord rank
    const guildMembers: { name: string; uuid: string }[] = guildDataResult.rows[0]?.members ?? [];
    const memberUuids = guildMembers.map(m => m.uuid);

    // Batch lookup discord_links for all guild members
    let memberRanks: Record<string, string> = {};
    if (memberUuids.length > 0) {
      const dlResult = await pool.query(
        `SELECT uuid, ign, rank FROM discord_links WHERE uuid = ANY($1::uuid[])`,
        [memberUuids]
      );
      for (const row of dlResult.rows) {
        memberRanks[row.uuid] = row.rank;
      }
    }

    const members = guildMembers.map(m => ({
      uuid: m.uuid,
      ign: m.name,
      rank: memberRanks[m.uuid] || '',
    }));

    const mapQueueRow = (row: any) => ({
      id: row.id,
      uuid: row.uuid,
      ign: row.ign,
      currentRank: row.current_rank,
      newRank: row.new_rank,
      actionType: row.action_type,
      queuedByIgn: row.queued_by_ign,
      createdAt: row.created_at,
      status: row.status,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
    });

    return NextResponse.json({
      members,
      pendingQueue: pendingResult.rows.map(mapQueueRow),
      recentHistory: historyResult.rows.map(mapQueueRow),
    });
  } catch (error) {
    console.error('Promotions fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch promotions data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, ign, currentRank, newRank, actionType } = await request.json();

    if (!uuid || !ign || !currentRank || !actionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['promote', 'demote', 'remove'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

    // Enforce: user can only manage members with a rank lower than their own
    const userRankIdx = RANK_HIERARCHY.indexOf(session.rank);
    const targetRankIdx = RANK_HIERARCHY.indexOf(currentRank);
    if (userRankIdx === -1 || targetRankIdx === -1 || targetRankIdx >= userRankIdx) {
      return NextResponse.json({ error: 'You cannot manage members at or above your rank' }, { status: 403 });
    }

    // Validate rank direction
    if (actionType !== 'remove') {
      if (!newRank) {
        return NextResponse.json({ error: 'New rank is required for promote/demote' }, { status: 400 });
      }
      const currentIdx = RANK_HIERARCHY.indexOf(currentRank);
      const newIdx = RANK_HIERARCHY.indexOf(newRank);
      if (currentIdx === -1 || newIdx === -1) {
        return NextResponse.json({ error: 'Invalid rank' }, { status: 400 });
      }
      if (actionType === 'promote' && newIdx <= currentIdx) {
        return NextResponse.json({ error: 'New rank must be higher for promotion' }, { status: 400 });
      }
      if (actionType === 'demote' && newIdx >= currentIdx) {
        return NextResponse.json({ error: 'New rank must be lower for demotion' }, { status: 400 });
      }
    }

    const pool = getPool();

    // Check for duplicate pending entry
    const existing = await pool.query(
      `SELECT id FROM promotion_queue WHERE uuid = $1 AND status = 'pending'`,
      [uuid]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ error: 'This player already has a pending promotion/demotion' }, { status: 409 });
    }

    await pool.query(
      `INSERT INTO promotion_queue (uuid, ign, current_rank, new_rank, action_type, queued_by_discord_id, queued_by_ign)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [uuid, ign, currentRank, newRank || null, actionType, session.discord_id, session.ign]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Promotion queue error:', error);
    return NextResponse.json({ error: 'Failed to queue promotion' }, { status: 500 });
  }
}
