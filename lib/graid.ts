import { getPool } from "./db";
import { RAID_NAMES, RAID_SHORT_NAMES } from "./raid-constants";

export { RAID_NAMES, RAID_SHORT_NAMES };

export type PointConfig = {
  threshold: number;
  points: number;
};

export type PlacementBonus = {
  placement: number;
  points: number;
};

export type ActiveEvent = {
  id: number;
  title: string;
  startTs: string;
  endTs: string | null;
  active?: boolean;
  rewardMode: "points" | "legacy";
  minPoints: number;
  lePerPoint: number;
  raidPoints: Record<string, number>;
  milestones: PointConfig[];
  placementBonuses: PlacementBonus[];
  minc: number;
  low: number;
  high: number;
  bonusThreshold: number | null;
  bonusAmount: number | null;
};

export type Row = {
  username: string;
  rank: string | null;
  uuid?: string;
  rankingPoints: number;
  rewardPoints: number;
  payoutLe: number;
  bonusDetails: string[];
  meetsMin: boolean;
  rankNum: number;
  paid?: boolean;
  total: number;
  payout: number;
  isRankLeader: boolean;
};

type EventRow = {
  id: number;
  title: string;
  start_ts: Date | string;
  end_ts: Date | string | null;
  active?: boolean;
  min_points?: number;
  le_per_point?: number;
  low_rank_reward?: number;
  high_rank_reward?: number;
  min_completions?: number;
  bonus_threshold?: number | null;
  bonus_amount?: number | null;
};

type PlayerAccumulator = {
  uuid: string;
  username: string;
  rank: string | null;
  rankingPoints: number;
  reachedAtMs: number;
  reachedLogId: number;
};

type LegacyBaseRow = {
  username: string;
  rank: string | null;
  uuid?: string;
  total: number;
  payout: number;
  meetsMin: boolean;
  paid: boolean;
};

function toIso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function defaultRaidPoints(): Record<string, number> {
  return Object.fromEntries(RAID_NAMES.map(name => [name, 0]));
}

function buildEvent(row: EventRow): ActiveEvent {
  const minPoints = Number(row.min_points ?? 0);
  const minCompletions = Number(row.min_completions ?? 0);
  return {
    id: Number(row.id),
    title: row.title,
    startTs: toIso(row.start_ts) ?? new Date().toISOString(),
    endTs: toIso(row.end_ts),
    active: row.active,
    rewardMode: "points",
    minPoints,
    lePerPoint: Number(row.le_per_point ?? 1),
    raidPoints: defaultRaidPoints(),
    milestones: [],
    placementBonuses: [],
    minc: minPoints || minCompletions,
    low: Number(row.low_rank_reward ?? 0),
    high: Number(row.high_rank_reward ?? 0),
    bonusThreshold: row.bonus_threshold != null ? Number(row.bonus_threshold) : null,
    bonusAmount: row.bonus_amount != null ? Number(row.bonus_amount) : null,
  };
}

const LOW_RANKS = new Set(["Starfish", "Manatee", "Piranha"]);

function isLow(rank?: string | null) {
  return rank ? LOW_RANKS.has(rank) : false;
}

async function loadEventConfig(client: any, event: ActiveEvent) {
  const [raidPointsRes, milestonesRes, placementsRes] = await Promise.all([
    client.query(
      `SELECT raid_type, points
       FROM graid_event_raid_points
       WHERE event_id = $1`,
      [event.id]
    ),
    client.query(
      `SELECT threshold_points, bonus_points
       FROM graid_event_milestones
       WHERE event_id = $1
       ORDER BY threshold_points ASC`,
      [event.id]
    ),
    client.query(
      `SELECT placement, bonus_points
       FROM graid_event_placement_bonuses
       WHERE event_id = $1
       ORDER BY placement ASC`,
      [event.id]
    ),
  ]);

  for (const row of raidPointsRes.rows) {
    event.raidPoints[row.raid_type] = Number(row.points ?? 0);
  }
  event.rewardMode = raidPointsRes.rowCount > 0 ? "points" : "legacy";
  event.milestones = milestonesRes.rows.map((row: any) => ({
    threshold: Number(row.threshold_points),
    points: Number(row.bonus_points ?? 0),
  }));
  event.placementBonuses = placementsRes.rows.map((row: any) => ({
    placement: Number(row.placement),
    points: Number(row.bonus_points ?? 0),
  }));
}

function applyRewardBonuses(event: ActiveEvent, row: PlayerAccumulator, placement: number): Omit<Row, "rankNum"> {
  const bonusDetails: string[] = [];
  let rewardPoints = row.rankingPoints;

  for (const milestone of event.milestones) {
    if (row.rankingPoints >= milestone.threshold && milestone.points > 0) {
      rewardPoints += milestone.points;
      bonusDetails.push(`+${milestone.points} from ${milestone.threshold} point milestone`);
    }
  }

  const placementBonus = event.placementBonuses.find(item => item.placement === placement);
  if (placementBonus && placementBonus.points > 0) {
    rewardPoints += placementBonus.points;
    const label = placement === 1 ? "1st" : placement === 2 ? "2nd" : placement === 3 ? "3rd" : `${placement}th`;
    bonusDetails.push(`+${placementBonus.points} from ${label} place`);
  }

  const payoutLe = rewardPoints * event.lePerPoint;
  return {
    username: row.username || "(unknown)",
    rank: row.rank,
    uuid: row.uuid,
    rankingPoints: row.rankingPoints,
    rewardPoints,
    payoutLe,
    bonusDetails,
    meetsMin: row.rankingPoints >= event.minPoints,
    paid: false,
    total: row.rankingPoints,
    payout: payoutLe,
    isRankLeader: false,
  };
}

async function buildRows(client: any, event: ActiveEvent): Promise<Row[]> {
  if (event.rewardMode === "legacy") {
    return buildLegacyRows(client, event);
  }

  const [contribRes, paidRes] = await Promise.all([
    client.query(
      `SELECT gl.id AS log_id,
              gl.completed_at,
              gl.raid_type,
              glp.uuid::text AS uuid,
              COALESCE(dl.ign, glp.ign, glp.uuid::text) AS username,
              dl.rank AS rank
       FROM graid_logs gl
       JOIN graid_log_participants glp ON glp.log_id = gl.id
       LEFT JOIN discord_links dl ON dl.uuid = glp.uuid
       WHERE gl.event_id = $1
         AND glp.uuid IS NOT NULL
       ORDER BY gl.completed_at ASC, gl.id ASC`,
      [event.id]
    ),
    client.query(
      `SELECT uuid::text AS uuid, COALESCE(paid, false) AS paid
       FROM graid_event_totals
       WHERE event_id = $1`,
      [event.id]
    ),
  ]);

  const paidByUuid = new Map<string, boolean>();
  for (const row of paidRes.rows) {
    paidByUuid.set(String(row.uuid), !!row.paid);
  }

  const players = new Map<string, PlayerAccumulator>();
  for (const row of contribRes.rows) {
    const points = Number(event.raidPoints[row.raid_type] ?? 0);
    if (points <= 0) continue;

    const uuid = String(row.uuid);
    const completedAt = row.completed_at instanceof Date ? row.completed_at : new Date(row.completed_at);
    const existing = players.get(uuid);
    if (!existing) {
      players.set(uuid, {
        uuid,
        username: row.username || "(unknown)",
        rank: row.rank ?? null,
        rankingPoints: points,
        reachedAtMs: completedAt.getTime(),
        reachedLogId: Number(row.log_id),
      });
      continue;
    }

    existing.username = row.username || existing.username;
    existing.rank = row.rank ?? existing.rank;
    existing.rankingPoints += points;
    existing.reachedAtMs = completedAt.getTime();
    existing.reachedLogId = Number(row.log_id);
  }

  const sorted = [...players.values()].sort((a, b) => {
    if (b.rankingPoints !== a.rankingPoints) return b.rankingPoints - a.rankingPoints;
    if (a.reachedAtMs !== b.reachedAtMs) return a.reachedAtMs - b.reachedAtMs;
    if (a.reachedLogId !== b.reachedLogId) return a.reachedLogId - b.reachedLogId;
    return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
  });

  return sorted.map((player, index) => {
    const rankNum = index + 1;
    const row = applyRewardBonuses(event, player, rankNum);
    return { ...row, rankNum, paid: paidByUuid.get(player.uuid) ?? false };
  });
}

async function buildLegacyRows(client: any, event: ActiveEvent): Promise<Row[]> {
  const [rowsRes, raidRewardsRes, typeCountsRes] = await Promise.all([
    client.query(
      `SELECT dl.ign AS username,
              dl.rank AS rank,
              get.total AS total,
              get.uuid::text AS uuid,
              COALESCE(get.paid, false) AS paid
       FROM graid_event_totals get
       JOIN discord_links dl ON dl.uuid = get.uuid
       WHERE get.event_id = $1
       ORDER BY get.total DESC, dl.ign ASC
       LIMIT 1000`,
      [event.id]
    ),
    client.query(
      `SELECT raid_type, low_rank_reward, high_rank_reward
       FROM graid_event_raid_rewards
       WHERE event_id = $1`,
      [event.id]
    ),
    client.query(
      `SELECT glp.uuid::text AS uuid, gl.raid_type, COUNT(*) AS cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON gl.id = glp.log_id
       WHERE gl.event_id = $1
         AND glp.uuid IS NOT NULL
       GROUP BY glp.uuid, gl.raid_type`,
      [event.id]
    ),
  ]);

  const typeOverrides: Record<string, { low: number; high: number }> = {};
  for (const row of raidRewardsRes.rows) {
    typeOverrides[row.raid_type] = {
      low: Number(row.low_rank_reward ?? 0),
      high: Number(row.high_rank_reward ?? 0),
    };
  }

  const playerTypeCounts: Record<string, Record<string, number>> = {};
  for (const row of typeCountsRes.rows) {
    const uuid = String(row.uuid);
    if (!playerTypeCounts[uuid]) playerTypeCounts[uuid] = {};
    playerTypeCounts[uuid][row.raid_type || "__unknown__"] = Number(row.cnt ?? 0);
  }

  const baseRows: LegacyBaseRow[] = rowsRes.rows.map((row: any) => {
    const total = Number(row.total ?? 0);
    const lowRank = isLow(row.rank);
    const counts = playerTypeCounts[String(row.uuid)] || {};
    let payout = 0;

    if (Object.keys(typeOverrides).length > 0 && Object.keys(counts).length > 0) {
      for (const [raidType, count] of Object.entries(counts)) {
        const override = typeOverrides[raidType];
        payout += count * (override ? (lowRank ? override.low : override.high) : (lowRank ? event.low : event.high));
      }
    } else {
      payout = total * (lowRank ? event.low : event.high);
    }

    return {
      username: row.username || "(unknown)",
      rank: row.rank ?? null,
      uuid: row.uuid ? String(row.uuid) : undefined,
      total,
      payout,
      meetsMin: total >= event.minc,
      paid: !!row.paid,
    };
  });

  const rankGroups: Record<string, any[]> = {};
  for (const row of baseRows) {
    const key = row.rank || "Unknown";
    if (!rankGroups[key]) rankGroups[key] = [];
    rankGroups[key].push(row);
  }

  const rankLeaders: Record<string, number> = {};
  for (const rank of Object.keys(rankGroups)) {
    rankLeaders[rank] = Math.max(...rankGroups[rank].map(row => row.total));
  }

  let lastTotal: number | null = null;
  let lastRank = 0;
  let ties = 0;

  return baseRows.map(row => {
    let rankNum: number;
    if (lastTotal === null) {
      rankNum = 1;
      ties = 1;
    } else if (row.total === lastTotal) {
      rankNum = lastRank;
      ties += 1;
    } else {
      rankNum = lastRank + ties;
      ties = 1;
    }
    lastTotal = row.total;
    lastRank = rankNum;

    const isRankLeader = !!row.rank && row.total === rankLeaders[row.rank];
    let payout = row.payout;
    if (rankNum === 1) {
      payout *= 2;
    } else if (rankNum >= 2 && rankNum <= 5) {
      payout *= 1.5;
    } else if (isRankLeader) {
      payout *= 1.5;
    }

    if (event.bonusThreshold != null && event.bonusAmount != null && row.total >= event.bonusThreshold) {
      payout += event.bonusAmount * 4096;
    }

    const roundedPayout = Math.round(payout);
    const payoutLe = Math.ceil(roundedPayout / 4096);

    return {
      username: row.username,
      rank: row.rank,
      uuid: row.uuid,
      rankingPoints: row.total,
      rewardPoints: row.total,
      payoutLe,
      bonusDetails: [],
      meetsMin: row.meetsMin,
      rankNum,
      paid: row.paid,
      total: row.total,
      payout: roundedPayout,
      isRankLeader,
    };
  });
}

const EVENT_COLS = `id, title, start_ts, end_ts, active, min_points, le_per_point,
                    low_rank_reward, high_rank_reward, min_completions, bonus_threshold, bonus_amount`;

async function fetchByQuery(sql: string, params: any[]): Promise<{ event: ActiveEvent | null; rows: Row[] }> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const evRes = await client.query(sql, params);
    if (evRes.rowCount === 0) return { event: null, rows: [] };
    const event = buildEvent(evRes.rows[0]);
    await loadEventConfig(client, event);
    const rows = await buildRows(client, event);
    return { event, rows };
  } finally {
    client.release();
  }
}

export function fetchEventById(id: number) {
  return fetchByQuery(`SELECT ${EVENT_COLS} FROM graid_events WHERE id = $1`, [id]);
}

export function fetchMostRecentEvent() {
  return fetchByQuery(
    `SELECT ${EVENT_COLS} FROM graid_events WHERE end_ts IS NOT NULL ORDER BY end_ts DESC LIMIT 1`,
    []
  );
}

export function fetchActiveEvent() {
  return fetchByQuery(`SELECT ${EVENT_COLS} FROM graid_events WHERE active = TRUE LIMIT 1`, []);
}
