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

  const raidsResult = await pool.query(
    `SELECT gl.id, gl.raid_type, gl.completed_at
     FROM graid_log_participants glp
     JOIN graid_logs gl ON glp.log_id = gl.id
     WHERE LOWER(glp.ign) = LOWER($1)
     ORDER BY gl.completed_at DESC`,
    [ign]
  );

  if (raidsResult.rows.length === 0) return null;

  const rows = raidsResult.rows;
  const total = rows.length;
  const dates = rows.map((r: any) => r.completed_at);
  const streaks = computeStreaks(dates);

  // Raid type breakdown
  const raidTypeCounts: Record<string, number> = { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, Unknown: 0 };
  for (const r of rows) {
    const short = getRaidShort(r.raid_type);
    raidTypeCounts[short] = (raidTypeCounts[short] || 0) + 1;
  }

  // Ranking
  const rankResult = await pool.query(
    `SELECT glp.ign, COUNT(*) as cnt
     FROM graid_log_participants glp
     JOIN graid_logs gl ON glp.log_id = gl.id
     GROUP BY glp.ign
     ORDER BY cnt DESC`
  );
  const ranking = rankResult.rows.findIndex((r: any) => r.ign.toLowerCase() === ign.toLowerCase()) + 1;

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

  // Top teammates + duo partners
  const raidIds = [...new Set(rows.map((r: any) => r.id))];
  let topTeammates: { ign: string; count: number }[] = [];
  let duoPartners: { ign: string; count: number }[] = [];
  if (raidIds.length > 0) {
    const placeholders = raidIds.map((_: any, i: number) => `$${i + 2}`).join(',');
    const tmResult = await pool.query(
      `SELECT ign, COUNT(*) as cnt
       FROM graid_log_participants
       WHERE log_id IN (${placeholders}) AND LOWER(ign) != LOWER($1)
       GROUP BY ign
       ORDER BY cnt DESC
       LIMIT 10`,
      [ign, ...raidIds]
    );
    topTeammates = tmResult.rows.map((r: any) => ({ ign: r.ign, count: parseInt(r.cnt, 10) }));
    duoPartners = tmResult.rows.map((r: any) => ({ ign: r.ign, count: parseInt(r.cnt, 10) }));
  }

  // Activity by day of week
  const activityByDay: Record<string, number> = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const r of rows) {
    const dayName = dayNames[new Date(r.completed_at).getDay()];
    activityByDay[dayName]++;
  }

  // Recent raids (last 10) with participants
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
      `SELECT log_id, ign, uuid FROM graid_log_participants WHERE log_id IN (${placeholders})`,
      recentIds
    );
    const partMap: Record<number, { ign: string; uuid: string | null }[]> = {};
    for (const r of recentPartResult.rows) {
      if (!partMap[r.log_id]) partMap[r.log_id] = [];
      partMap[r.log_id].push({ ign: r.ign, uuid: r.uuid });
    }
    recentRaids = recentLogResult.rows.map((r: any) => ({
      id: r.id,
      raidType: r.raid_type,
      completedAt: r.completed_at,
      participants: partMap[r.id] || [],
    }));
  }

  return {
    ign: rows[0].ign || ign,
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
