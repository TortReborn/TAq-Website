import { getPool } from '@/lib/db';
import { getRaidShort } from '@/lib/graid-log-constants';

export interface PlayerGraidStats {
  ign: string;
  total: number;
  raidTypeCounts: Record<string, number>;
  bestStreak: number;
  currentStreak: number;
  ranking: number;
  firstRaid: string;
  latestRaid: string;
  bestDay: { date: string; count: number };
  topTeammates: { ign: string; count: number }[];
  duoPartners: { ign: string; count: number }[];
  recentRaids: {
    id: number;
    raidType: string | null;
    completedAt: string;
    participants: { ign: string; uuid: string | null }[];
  }[];
  activityByDay: Record<string, number>;
}

function computeStreaks(dates: string[]): { best: number; current: number } {
  if (dates.length === 0) return { best: 0, current: 0 };
  const daySet = new Set<string>();
  for (const d of dates) daySet.add(new Date(d).toISOString().slice(0, 10));
  const sortedDays = Array.from(daySet).sort();
  let best = 1, run = 1;
  for (let i = 1; i < sortedDays.length; i++) {
    const diff = (new Date(sortedDays[i]).getTime() - new Date(sortedDays[i - 1]).getTime()) / 86400000;
    if (diff === 1) { run++; if (run > best) best = run; } else run = 1;
  }
  if (run > best) best = run;
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  let current = 0;
  const last = sortedDays[sortedDays.length - 1];
  if (last === today || last === yesterday) {
    current = 1;
    for (let i = sortedDays.length - 2; i >= 0; i--) {
      const diff = (new Date(sortedDays[i + 1]).getTime() - new Date(sortedDays[i]).getTime()) / 86400000;
      if (diff === 1) current++; else break;
    }
  }
  return { best, current };
}

export async function getPlayerGraidStats(ign: string): Promise<PlayerGraidStats | null> {
  const pool = getPool();

  // Resolve IGN → UUID via discord_links
  const uuidResult = await pool.query(
    `SELECT uuid FROM discord_links WHERE LOWER(ign) = LOWER($1) AND uuid IS NOT NULL`,
    [ign]
  );
  const playerUuid = uuidResult.rows.length > 0 ? uuidResult.rows[0].uuid : null;

  // Query by UUID if available, otherwise by IGN
  let raidsResult;
  if (playerUuid) {
    raidsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       WHERE glp.uuid = $1
       ORDER BY gl.completed_at DESC`,
      [playerUuid]
    );
  } else {
    raidsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       WHERE LOWER(glp.ign) = LOWER($1)
       ORDER BY gl.completed_at DESC`,
      [ign]
    );
  }

  if (raidsResult.rows.length === 0) return null;

  const rows = raidsResult.rows;
  let total = rows.length;

  // Add offset (all-time only)
  if (playerUuid) {
    const offsetResult = await pool.query(
      `SELECT raid_offset FROM graid_raid_offsets WHERE uuid = $1`, [playerUuid]
    );
    if (offsetResult.rows.length > 0) {
      total += offsetResult.rows[0].raid_offset;
    }
  }

  const dates = rows.map((r: any) => r.completed_at);
  const streaks = computeStreaks(dates);

  // Raid type breakdown
  const raidTypeCounts: Record<string, number> = { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, TWP: 0, Unknown: 0 };
  for (const r of rows) {
    const short = getRaidShort(r.raid_type);
    raidTypeCounts[short] = (raidTypeCounts[short] || 0) + 1;
  }

  // Ranking (UUID-first with offsets)
  const rankResult = await pool.query(
    `SELECT glp.uuid, COALESCE(dl.ign, glp.ign) AS display_name, COUNT(*) as cnt
     FROM graid_log_participants glp
     LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
     GROUP BY glp.uuid, COALESCE(dl.ign, glp.ign)`
  );
  const offsetResult = await pool.query(`SELECT uuid, raid_offset FROM graid_raid_offsets`);
  const offsets = new Map(offsetResult.rows.map((r: any) => [String(r.uuid), r.raid_offset]));

  const ranked = rankResult.rows.map((r: any) => ({
    uuid: r.uuid,
    name: r.display_name,
    total: parseInt(r.cnt, 10) + (offsets.get(String(r.uuid)) || 0),
  })).sort((a, b) => b.total - a.total);

  const ranking = playerUuid
    ? ranked.findIndex(r => String(r.uuid) === String(playerUuid)) + 1
    : ranked.findIndex(r => r.name.toLowerCase() === ign.toLowerCase()) + 1;

  // First and latest
  const firstRaid = rows[rows.length - 1].completed_at;
  const latestRaid = rows[0].completed_at;

  // Best day
  const dayCounts: Record<string, number> = {};
  for (const r of rows) {
    const day = new Date(r.completed_at).toISOString().slice(0, 10);
    dayCounts[day] = (dayCounts[day] || 0) + 1;
  }
  let bestDay = { date: '', count: 0 };
  for (const [date, count] of Object.entries(dayCounts)) {
    if (count > bestDay.count) bestDay = { date, count };
  }

  // Top teammates + duo partners (UUID-first, display from discord_links)
  const raidIds = [...new Set(rows.map((r: any) => r.id))];
  let topTeammates: { ign: string; count: number }[] = [];
  let duoPartners: { ign: string; count: number }[] = [];
  if (raidIds.length > 0) {
    const placeholders = raidIds.map((_: any, i: number) => `$${i + 2}`).join(',');
    const tmResult = await pool.query(
      `SELECT COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid, COUNT(*) as cnt
       FROM graid_log_participants glp
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       WHERE log_id IN (${placeholders}) AND glp.uuid != $1
       GROUP BY glp.uuid, COALESCE(dl.ign, glp.ign)
       ORDER BY cnt DESC
       LIMIT 10`,
      [playerUuid || '00000000-0000-0000-0000-000000000000', ...raidIds]
    );
    topTeammates = tmResult.rows.map((r: any) => ({ ign: r.display_name, count: parseInt(r.cnt, 10) }));
    duoPartners = tmResult.rows.map((r: any) => ({ ign: r.display_name, count: parseInt(r.cnt, 10) }));
  }

  // Activity by day of week
  const activityByDay: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const r of rows) {
    const dayName = dayNames[new Date(r.completed_at).getDay()];
    activityByDay[dayName]++;
  }

  // Recent raids (last 10) with participants (display names from discord_links)
  const recentIds = raidIds.slice(0, 10);
  let recentRaids: PlayerGraidStats['recentRaids'] = [];
  if (recentIds.length > 0) {
    const placeholders = recentIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    const recentLogResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_logs gl
       WHERE gl.id IN (${placeholders})
       ORDER BY gl.completed_at DESC`,
      recentIds
    );
    const recentPartResult = await pool.query(
      `SELECT glp.log_id, COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid
       FROM graid_log_participants glp
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       WHERE glp.log_id IN (${placeholders})`,
      recentIds
    );
    const partMap: Record<number, { ign: string; uuid: string | null }[]> = {};
    for (const r of recentPartResult.rows) {
      if (!partMap[r.log_id]) partMap[r.log_id] = [];
      partMap[r.log_id].push({ ign: r.display_name, uuid: r.uuid });
    }
    recentRaids = recentLogResult.rows.map((r: any) => ({
      id: r.id,
      raidType: r.raid_type,
      completedAt: r.completed_at,
      participants: partMap[r.id] || [],
    }));
  }

  return {
    ign,
    total,
    raidTypeCounts,
    bestStreak: streaks.best,
    currentStreak: streaks.current,
    ranking,
    firstRaid,
    latestRaid,
    bestDay,
    topTeammates,
    duoPartners,
    recentRaids,
    activityByDay,
  };
}
