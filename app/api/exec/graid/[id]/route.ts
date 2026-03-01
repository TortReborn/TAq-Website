import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const eventId = parseInt(id, 10);
    if (isNaN(eventId)) {
      return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
    }

    const updates = await request.json();
    const pool = getPool();

    // Build dynamic SET clause
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      setClauses.push(`title = $${paramIndex++}`);
      values.push(updates.title.trim());
    }
    if (updates.lowRankReward !== undefined) {
      setClauses.push(`low_rank_reward = $${paramIndex++}`);
      values.push(updates.lowRankReward);
    }
    if (updates.highRankReward !== undefined) {
      setClauses.push(`high_rank_reward = $${paramIndex++}`);
      values.push(updates.highRankReward);
    }
    if (updates.minCompletions !== undefined) {
      setClauses.push(`min_completions = $${paramIndex++}`);
      values.push(updates.minCompletions);
    }
    if (updates.bonusThreshold !== undefined) {
      setClauses.push(`bonus_threshold = $${paramIndex++}`);
      values.push(updates.bonusThreshold || null);
    }
    if (updates.bonusAmount !== undefined) {
      setClauses.push(`bonus_amount = $${paramIndex++}`);
      values.push(updates.bonusAmount || null);
    }
    if (updates.active !== undefined) {
      setClauses.push(`active = $${paramIndex++}`);
      values.push(updates.active);
      // If deactivating, also set end_ts
      if (updates.active === false) {
        setClauses.push(`end_ts = NOW()`);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(eventId);
    await pool.query(
      `UPDATE graid_events SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
      values
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'An event with that title already exists' }, { status: 409 });
    }
    console.error('Graid event update error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  }
}
