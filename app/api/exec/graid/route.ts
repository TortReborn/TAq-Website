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
    const result = await pool.query(
      `SELECT id, title, start_ts, end_ts, active, low_rank_reward, high_rank_reward,
              min_completions, bonus_threshold, bonus_amount, created_at
       FROM graid_events
       ORDER BY active DESC, start_ts DESC`
    );

    return NextResponse.json({
      events: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        startTs: row.start_ts,
        endTs: row.end_ts,
        active: row.active,
        lowRankReward: row.low_rank_reward,
        highRankReward: row.high_rank_reward,
        minCompletions: row.min_completions,
        bonusThreshold: row.bonus_threshold,
        bonusAmount: row.bonus_amount,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Graid events fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { title, lowRankReward, highRankReward, minCompletions, bonusThreshold, bonusAmount } = await request.json();

    if (!title || !lowRankReward || !highRankReward || !minCompletions) {
      return NextResponse.json({ error: 'Title, rewards, and min completions are required' }, { status: 400 });
    }

    const pool = getPool();

    // Check no other event is active
    const activeCheck = await pool.query(`SELECT id FROM graid_events WHERE active = TRUE LIMIT 1`);
    if (activeCheck.rowCount && activeCheck.rowCount > 0) {
      return NextResponse.json({ error: 'Another event is already active. End it first.' }, { status: 400 });
    }

    const result = await pool.query(
      `INSERT INTO graid_events (title, start_ts, low_rank_reward, high_rank_reward, min_completions,
                                  bonus_threshold, bonus_amount, created_by_discord, active)
       VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, true)
       RETURNING id`,
      [title.trim(), lowRankReward, highRankReward, minCompletions,
       bonusThreshold || null, bonusAmount || null, session.discord_id]
    );

    return NextResponse.json({ success: true, id: result.rows[0].id });
  } catch (error: any) {
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'An event with that title already exists' }, { status: 409 });
    }
    console.error('Graid event create error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
