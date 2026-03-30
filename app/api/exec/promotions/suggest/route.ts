import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RANK_HIERARCHY, PROMO_VISIBILITY_RANK_THRESHOLD_IDX, PROMO_VISIBILITY_MIN_VIEWER_IDX } from '@/lib/rank-constants';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, ign, currentRank, reason } = await request.json();

    if (!uuid || !ign || !currentRank) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const trimmedReason = typeof reason === 'string' ? reason.trim() : null;
    if (trimmedReason && trimmedReason.length > 50) {
      return NextResponse.json({ error: 'Reason must be 50 characters or less' }, { status: 400 });
    }

    // Only Narwhal+ can suggest promotions for Hammerhead+ members
    const targetRankIdx = RANK_HIERARCHY.indexOf(currentRank);
    if (targetRankIdx >= PROMO_VISIBILITY_RANK_THRESHOLD_IDX) {
      let userRankIdx = RANK_HIERARCHY.indexOf(session.rank);
      if (userRankIdx === -1 && session.rank.includes('Hydra')) {
        userRankIdx = RANK_HIERARCHY.indexOf('Hydra');
      }
      if (userRankIdx < PROMO_VISIBILITY_MIN_VIEWER_IDX) {
        return NextResponse.json({ error: 'Only Narwhal+ can suggest promotions for this rank' }, { status: 403 });
      }
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO promo_suggestions (uuid, ign, current_rank, suggested_by_discord_id, suggested_by_ign, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (uuid) DO NOTHING`,
      [uuid, ign, currentRank, session.discord_id, session.ign, trimmedReason || null]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Promo suggestion error:', error);
    return NextResponse.json({ error: 'Failed to add suggestion' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing suggestion id' }, { status: 400 });
    }

    const pool = getPool();
    const result = await pool.query(
      `DELETE FROM promo_suggestions WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Remove suggestion error:', error);
    return NextResponse.json({ error: 'Failed to remove suggestion' }, { status: 500 });
  }
}
