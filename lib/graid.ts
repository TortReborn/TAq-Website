
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
      `SELECT id, title, start_ts, end_ts, low_rank_reward, high_rank_reward, min_completions
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
      minc: Number(ev.min_completions)
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
    let lastTotal: number | null = null;
    let lastRank = 0;
    let count = 0;
    const rows: Row[] = baseRows.map((row, i) => {
      count++;
      let rankNum = lastRank + 1;
      if (lastTotal !== null && row.total === lastTotal) {
        rankNum = lastRank;
      }
      lastTotal = row.total;
      lastRank = rankNum;
      let payout = row.payout;
      if (rankNum === 1) {
        payout = payout * 2;
      } else if (rankNum >= 2 && rankNum <= 5) {
        payout = payout * 1.5;
      }
      return { ...row, rankNum, payout: Math.round(payout) };
    });
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
};

export type Row = {
  username: string;
  rank: string | null;
  total: number;
  payout: number;
  meetsMin: boolean;
  rankNum: number;
};

const LOW_RANKS = new Set(["Starfish", "Manatee", "Piranha", "Barracuda"]);

function isLow(rank?: string | null) {
  return rank ? LOW_RANKS.has(rank) : false;
}

export async function fetchActiveEvent(): Promise<{
  event: ActiveEvent | null;
  rows: Row[];
}> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const evRes = await client.query(
      `SELECT id, title, start_ts, end_ts, low_rank_reward, high_rank_reward, min_completions
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
      minc: Number(ev.min_completions)
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

    let lastTotal: number | null = null;
    let lastRank = 0;
    let count = 0;
    // Assign ranks and adjust payout based on rank
    const rows: Row[] = baseRows.map((row, i) => {
      count++;
      let rankNum = lastRank + 1;
      if (lastTotal !== null && row.total === lastTotal) {
        rankNum = lastRank;
      }
      lastTotal = row.total;
      lastRank = rankNum;
      let payout = row.payout;
      if (rankNum === 1) {
        payout = payout * 2;
      } else if (rankNum >= 2 && rankNum <= 5) {
        payout = payout * 1.5;
      }
      return { ...row, rankNum, payout: Math.round(payout) };
    });

    return { event, rows };
  } finally {
    client.release();
  }
}

// fmtInt and fmtDate are now imported from utils.ts
