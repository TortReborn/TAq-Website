import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RANK_HIERARCHY } from '@/lib/rank-constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { entries } = await request.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'Entries array is required' }, { status: 400 });
    }

    if (entries.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 entries per bulk operation' }, { status: 400 });
    }

    // Enforce: user can only manage members with a rank lower than their own
    const userRankIdx = RANK_HIERARCHY.indexOf(session.rank);

    // Validate all entries
    for (const entry of entries) {
      if (!entry.uuid || !entry.ign || !entry.currentRank || !entry.actionType) {
        return NextResponse.json({ error: 'Each entry requires uuid, ign, currentRank, and actionType' }, { status: 400 });
      }
      const targetRankIdx = RANK_HIERARCHY.indexOf(entry.currentRank);
      if (userRankIdx === -1 || targetRankIdx === -1 || targetRankIdx >= userRankIdx) {
        return NextResponse.json({ error: `You cannot manage ${entry.ign} — their rank is at or above yours` }, { status: 403 });
      }
      if (!['promote', 'demote', 'remove'].includes(entry.actionType)) {
        return NextResponse.json({ error: `Invalid action type for ${entry.ign}` }, { status: 400 });
      }
      if (entry.actionType !== 'remove') {
        if (!entry.newRank) {
          return NextResponse.json({ error: `New rank required for ${entry.ign}` }, { status: 400 });
        }
        const currentIdx = RANK_HIERARCHY.indexOf(entry.currentRank);
        const newIdx = RANK_HIERARCHY.indexOf(entry.newRank);
        if (currentIdx === -1 || newIdx === -1) {
          return NextResponse.json({ error: `Invalid rank for ${entry.ign}` }, { status: 400 });
        }
        if (entry.actionType === 'promote' && newIdx <= currentIdx) {
          return NextResponse.json({ error: `New rank must be higher for ${entry.ign}` }, { status: 400 });
        }
        if (entry.actionType === 'demote' && newIdx >= currentIdx) {
          return NextResponse.json({ error: `New rank must be lower for ${entry.ign}` }, { status: 400 });
        }
      }
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check for duplicates
      const uuids = entries.map((e: any) => e.uuid);
      const existing = await client.query(
        `SELECT uuid FROM promotion_queue WHERE uuid = ANY($1::uuid[]) AND status = 'pending'`,
        [uuids]
      );
      const existingUuids = new Set(existing.rows.map((r: any) => r.uuid));

      let inserted = 0;
      let skipped = 0;

      for (const entry of entries) {
        if (existingUuids.has(entry.uuid)) {
          skipped++;
          continue;
        }
        await client.query(
          `INSERT INTO promotion_queue (uuid, ign, current_rank, new_rank, action_type, queued_by_discord_id, queued_by_ign)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [entry.uuid, entry.ign, entry.currentRank, entry.newRank || null,
           entry.actionType, session.discord_id, session.ign]
        );
        inserted++;
      }

      await client.query('COMMIT');
      return NextResponse.json({ success: true, inserted, skipped });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Bulk promotion queue error:', error);
    return NextResponse.json({ error: 'Failed to queue bulk promotions' }, { status: 500 });
  }
}
