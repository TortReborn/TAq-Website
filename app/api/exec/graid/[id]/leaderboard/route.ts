import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LOW_RANKS = new Set(["Starfish", "Manatee", "Piranha", "Barracuda"]);

function isLow(rank?: string | null) {
  return rank ? LOW_RANKS.has(rank) : false;
}

export async function GET(
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

    const pool = getPool();

    const evRes = await pool.query(
      `SELECT id, title, start_ts, end_ts, low_rank_reward, high_rank_reward,
              min_completions, bonus_threshold, bonus_amount, active
       FROM graid_events WHERE id = $1`,
      [eventId]
    );

    if (evRes.rowCount === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const ev = evRes.rows[0];
    const event = {
      id: ev.id,
      title: ev.title,
      startTs: ev.start_ts?.toISOString?.() ?? new Date(ev.start_ts).toISOString(),
      endTs: ev.end_ts ? (ev.end_ts.toISOString?.() ?? new Date(ev.end_ts).toISOString()) : null,
      low: Number(ev.low_rank_reward),
      high: Number(ev.high_rank_reward),
      minc: Number(ev.min_completions),
      bonusThreshold: ev.bonus_threshold != null ? Number(ev.bonus_threshold) : null,
      bonusAmount: ev.bonus_amount != null ? Number(ev.bonus_amount) : null,
    };

    const rowsRes = await pool.query(
      `SELECT dl.ign AS username, dl.rank AS rank, get.total AS total
       FROM graid_event_totals get
       JOIN discord_links dl ON dl.uuid = get.uuid
       WHERE get.event_id = $1
       ORDER BY get.total DESC, dl.ign ASC
       LIMIT 1000`,
      [eventId]
    );

    // Compute payouts with multipliers (replicating processRowsWithMultipliers logic)
    const baseRows = rowsRes.rows.map((r: any) => {
      const total = Number(r.total) || 0;
      const low = isLow(r.rank);
      const payout = total * (low ? event.low : event.high);
      const meetsMin = total >= event.minc;
      return { username: r.username || "(unknown)", rank: r.rank, total, payout, meetsMin };
    });

    // Find rank leaders
    const rankGroups: Record<string, any[]> = {};
    baseRows.forEach(row => {
      const key = row.rank || 'Unknown';
      if (!rankGroups[key]) rankGroups[key] = [];
      rankGroups[key].push(row);
    });
    const rankLeaders: Record<string, number> = {};
    Object.keys(rankGroups).forEach(rank => {
      rankLeaders[rank] = Math.max(...rankGroups[rank].map((r: any) => r.total));
    });

    // Competition ranking
    let lastTotal: number | null = null;
    let lastRank = 0;
    let ties = 0;

    const rows = baseRows.map(row => {
      let rankNum;
      if (lastTotal === null) { rankNum = 1; ties = 1; }
      else if (row.total === lastTotal) { rankNum = lastRank; ties++; }
      else { rankNum = lastRank + ties; ties = 1; }
      lastTotal = row.total;
      lastRank = rankNum;

      const isRankLeader = row.rank && row.total === rankLeaders[row.rank];
      let payout = row.payout;
      if (rankNum === 1) payout *= 2;
      else if (rankNum >= 2 && rankNum <= 5) payout *= 1.5;
      else if (isRankLeader) payout *= 1.5;

      if (event.bonusThreshold != null && event.bonusAmount != null && row.total >= event.bonusThreshold) {
        payout += event.bonusAmount * 4096;
      }

      return { ...row, rankNum, payout: Math.round(payout), isRankLeader: isRankLeader || false };
    });

    return NextResponse.json({ event, rows });
  } catch (error) {
    console.error('Graid leaderboard fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
