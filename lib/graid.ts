
"use server";
import { getPool } from "./db";
import { fmtInt, fmtDate } from "./utils";

// Fetch the most recent event (by latest end date)
export async function fetchMostRecentEvent(): Promise<{
  event: ActiveEvent | null;
  rows: Row[];
}> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const evRes = await client.query(
      `SELECT id, title, start_ts, end_ts, low_rank_reward, high_rank_reward, min_completions, bonus_threshold, bonus_amount
       FROM graid_events
       WHERE end_ts IS NOT NULL
       ORDER BY end_ts DESC
       LIMIT 1`
    );
    if (evRes.rowCount === 0) {
      return { event: null, rows: [] };
    }
    const ev = evRes.rows[0];
    const event: ActiveEvent = {
      id: ev.id,
      title: ev.title,
      startTs: ev.start_ts?.toISOString?.() ?? new Date(ev.start_ts).toISOString(),
      endTs: ev.end_ts ? (ev.end_ts.toISOString?.() ?? new Date(ev.end_ts).toISOString()) : null,
      low: Number(ev.low_rank_reward),
      high: Number(ev.high_rank_reward),
      minc: Number(ev.min_completions),
      bonusThreshold: ev.bonus_threshold != null ? Number(ev.bonus_threshold) : null,
      bonusAmount: ev.bonus_amount != null ? Number(ev.bonus_amount) : null
    };
    const rowsRes = await client.query(
      `SELECT dl.ign AS username, dl.rank AS rank, get.total AS total
       FROM graid_event_totals get
       JOIN discord_links dl ON dl.uuid = get.uuid
       WHERE get.event_id = $1
       ORDER BY get.total DESC, dl.ign ASC
       LIMIT 1000`,
      [event.id]
    );
    const baseRows = rowsRes.rows.map((r: any) => {
      const total = Number(r.total) || 0;
      const low = isLow(r.rank);
      const payout = total * (low ? event.low : event.high);
      const meetsMin = total >= event.minc;
      return {
        username: r.username || "(unknown)",
        rank: r.rank,
        total,
        payout,
        meetsMin
      };
    });
    
    const rows = processRowsWithMultipliers(baseRows, event);
    return { event, rows };
  } finally {
    client.release();
  }
}

export type ActiveEvent = {
  id: number;
  title: string;
  startTs: string; // ISO
  endTs: string | null; // ISO
  low: number;
  high: number;
  minc: number;
  bonusThreshold: number | null;
  bonusAmount: number | null;
};

export type Row = {
  username: string;
  rank: string | null;
  total: number;
  payout: number;
  meetsMin: boolean;
  rankNum: number;
  isRankLeader: boolean;
};

const LOW_RANKS = new Set(["Starfish", "Manatee", "Piranha", "Barracuda"]);

function isLow(rank?: string | null) {
  return rank ? LOW_RANKS.has(rank) : false;
}

// Helper function to determine rank leaders and apply multipliers
function processRowsWithMultipliers(baseRows: any[], event: ActiveEvent): Row[] {
  // Group by rank to find leaders
  const rankGroups: { [rank: string]: any[] } = {};
  baseRows.forEach(row => {
    const rankKey = row.rank || 'Unknown';
    if (!rankGroups[rankKey]) {
      rankGroups[rankKey] = [];
    }
    rankGroups[rankKey].push(row);
  });

  // Find the highest total for each rank
  const rankLeaders: { [rank: string]: number } = {};
  Object.keys(rankGroups).forEach(rank => {
    const maxTotal = Math.max(...rankGroups[rank].map((r: any) => r.total));
    rankLeaders[rank] = maxTotal;
  });

  // Competition ranking: 1,2,2,4,5... (next rank skips by number of ties)
  let lastTotal: number | null = null;
  let lastRank = 0;
  let ties = 0;
  
  const rows: Row[] = baseRows.map((row, i) => {
    let rankNum;
    if (lastTotal === null) {
      rankNum = 1;
      ties = 1;
    } else if (row.total === lastTotal) {
      rankNum = lastRank;
      ties++;
    } else {
      rankNum = lastRank + ties;
      ties = 1;
    }
    lastTotal = row.total;
    lastRank = rankNum;
    
    // Check if this person is a rank leader
    const isRankLeader = row.rank && row.total === rankLeaders[row.rank];
    
    let payout = row.payout;
    if (rankNum === 1) {
      // Rank 1 always gets 2x multiplier (takes precedence over rank leader)
      payout = payout * 2;
    } else if (rankNum >= 2 && rankNum <= 5) {
      // Ranks 2-5 get 1.5x multiplier (takes precedence over rank leader)
      payout = payout * 1.5;
    } else if (isRankLeader) {
      // Rank leaders (who aren't in top 5 overall) get 1.5x multiplier
      payout = payout * 1.5;
    }
    
    // Add bonus if threshold and amount are configured for this event
    if (event.bonusThreshold != null && event.bonusAmount != null && row.total >= event.bonusThreshold) {
      payout = payout + event.bonusAmount * 4096;
    }
    
    return { 
      ...row, 
      rankNum, 
      payout: Math.round(payout), 
      isRankLeader: isRankLeader || false 
    };
  });
  
  return rows;
}

export async function fetchActiveEvent(): Promise<{
  event: ActiveEvent | null;
  rows: Row[];
}> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const evRes = await client.query(
      `SELECT id, title, start_ts, end_ts, low_rank_reward, high_rank_reward, min_completions, bonus_threshold, bonus_amount, active
       FROM graid_events WHERE active = TRUE LIMIT 1`
    );
    if (evRes.rowCount === 0) {
      return { event: null, rows: [] };
    }

    const ev = evRes.rows[0];
    const event: ActiveEvent = {
      id: ev.id,
      title: ev.title,
      startTs: ev.start_ts?.toISOString?.() ?? new Date(ev.start_ts).toISOString(),
      endTs: ev.end_ts ? (ev.end_ts.toISOString?.() ?? new Date(ev.end_ts).toISOString()) : null,
      low: Number(ev.low_rank_reward),
      high: Number(ev.high_rank_reward),
      minc: Number(ev.min_completions),
      bonusThreshold: ev.bonus_threshold != null ? Number(ev.bonus_threshold) : null,
      bonusAmount: ev.bonus_amount != null ? Number(ev.bonus_amount) : null
    };

    // Join totals with discord_links to get IGN + rank.
    const rowsRes = await client.query(
      `SELECT dl.ign AS username, dl.rank AS rank, get.total AS total
       FROM graid_event_totals get
       JOIN discord_links dl ON dl.uuid = get.uuid
       WHERE get.event_id = $1
       ORDER BY get.total DESC, dl.ign ASC
       LIMIT 1000`,
      [event.id]
    );

    // Compute ranks with ties (standard competition ranking)
    const baseRows = rowsRes.rows.map((r: any) => {
      const total = Number(r.total) || 0;
      const low = isLow(r.rank);
      // payout will be adjusted after rank is assigned
      const payout = total * (low ? event.low : event.high);
      const meetsMin = total >= event.minc;
      return {
        username: r.username || "(unknown)",
        rank: r.rank,
        total,
        payout,
        meetsMin
      };
    });

    const rows = processRowsWithMultipliers(baseRows, event);
    return { event, rows };
  } finally {
    client.release();
  }
}

// fmtInt and fmtDate are now imported from utils.ts
