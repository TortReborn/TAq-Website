import type { Pool } from 'pg';
import { getPool } from '@/lib/db';
import { getRaidShort } from '@/lib/graid-log-constants';
import { resolveUuidByIgn } from '@/lib/discord-links';

export interface PlayerGraidStats {
  ign: string;
  uuid: string | null;
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

/** Format a uuid as lowercase hyphenated so it compares cleanly with uuid::text. */
function normalizeUuid(raw: string): string {
  const hex = raw.replace(/-/g, '').toLowerCase();
  if (hex.length !== 32) return raw.toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Look a member's uuid up in the cached live guild roster (members who never linked). */
async function lookupUuidFromGuildCache(pool: Pool, ign: string): Promise<string | null> {
  const result = await pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'guildData'`);
  const members = result.rows[0]?.data?.members;
  if (!Array.isArray(members)) return null;
  const lower = ign.toLowerCase();
  const match = members.find((m: any) => ((m.name || m.username) || '').toLowerCase() === lower);
  return match?.uuid ? normalizeUuid(String(match.uuid)) : null;
}

export async function getPlayerGraidStats(ign: string): Promise<PlayerGraidStats | null> {
  const pool = getPool();

  // Resolve IGN → UUID via discord_links (best link), falling back to the
  // live guild cache for members who never linked their Discord.
  let playerUuid = await resolveUuidByIgn(pool, ign)
    ?? await lookupUuidFromGuildCache(pool, ign);

  // Query by UUID if available (old NULL-uuid rows keep ign identity),
  // otherwise by IGN alone.
  let raidsResult;
  if (playerUuid) {
    raidsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       WHERE glp.uuid = $1 OR (glp.uuid IS NULL AND LOWER(glp.ign) = LOWER($2))
       ORDER BY gl.completed_at DESC`,
      [playerUuid, ign]
    );
  } else {
    raidsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at, glp.uuid
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       WHERE LOWER(glp.ign) = LOWER($1)
       ORDER BY gl.completed_at DESC`,
      [ign]
    );
    // Adopt the uuid recorded on the participant snapshots so offsets and
    // ranking still apply even when the lookups above missed.
    const snapshotUuid = raidsResult.rows.find((r: any) => r.uuid)?.uuid;
    if (snapshotUuid) playerUuid = String(snapshotUuid);
  }

  if (raidsResult.rows.length === 0) return null;

  const identityKey = playerUuid ? String(playerUuid) : `ign:${ign.toLowerCase()}`;

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
  const raidTypeCounts: Record<string, number> = { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, WTP: 0, Unknown: 0 };
  for (const r of rows) {
    const short = getRaidShort(r.raid_type);
    raidTypeCounts[short] = (raidTypeCounts[short] || 0) + 1;
  }

  // Ranking (grouped by stable identity so renames don't split players, with offsets)
  const rankResult = await pool.query(
    `SELECT COALESCE(glp.uuid::text, 'ign:' || LOWER(glp.ign)) AS key, COUNT(*) as cnt
     FROM graid_log_participants glp
     GROUP BY COALESCE(glp.uuid::text, 'ign:' || LOWER(glp.ign))`
  );
  const offsetResult = await pool.query(`SELECT uuid, raid_offset FROM graid_raid_offsets`);
  const offsets = new Map(offsetResult.rows.map((r: any) => [String(r.uuid), r.raid_offset]));

  const ranked = rankResult.rows.map((r: any) => ({
    key: r.key,
    total: parseInt(r.cnt, 10) + (offsets.get(r.key) || 0),
  })).sort((a, b) => b.total - a.total);

  let ranking = ranked.findIndex(r => r.key === identityKey) + 1;
  if (ranking === 0 && playerUuid) {
    // All of the player's rows may predate the uuid backfill
    ranking = ranked.findIndex(r => r.key === `ign:${ign.toLowerCase()}`) + 1;
  }

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

  // Top teammates + duo partners (grouped by stable identity; display the
  // discord_links name for uuid players, otherwise the latest ign snapshot).
  // Self-exclusion mirrors the player match above.
  const raidIds = [...new Set(rows.map((r: any) => r.id))];
  let topTeammates: { ign: string; count: number }[] = [];
  let duoPartners: { ign: string; count: number }[] = [];
  if (raidIds.length > 0) {
    const excludeClause = playerUuid
      ? `NOT (glp.uuid = $1 OR (glp.uuid IS NULL AND LOWER(glp.ign) = LOWER($2)))`
      : `LOWER(glp.ign) != LOWER($1)`;
    const excludeParams = playerUuid ? [playerUuid, ign] : [ign];
    const placeholders = raidIds.map((_: any, i: number) => `$${i + excludeParams.length + 1}`).join(',');
    const tmResult = await pool.query(
      `SELECT COALESCE(MAX(dl.ign), (array_agg(glp.ign ORDER BY glp.log_id DESC) FILTER (WHERE glp.ign IS NOT NULL))[1]) AS display_name,
              COUNT(*) as cnt
       FROM graid_log_participants glp
       LEFT JOIN LATERAL (
         SELECT ign
         FROM discord_links
         WHERE uuid = glp.uuid
         ORDER BY linked DESC, (rank <> '') DESC, discord_id
         LIMIT 1
       ) dl ON TRUE
       WHERE glp.log_id IN (${placeholders}) AND ${excludeClause}
       GROUP BY COALESCE(glp.uuid::text, 'ign:' || LOWER(glp.ign))
       ORDER BY cnt DESC
       LIMIT 10`,
      [...excludeParams, ...raidIds]
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
       LEFT JOIN LATERAL (
         SELECT ign
         FROM discord_links
         WHERE uuid = glp.uuid
         ORDER BY linked DESC, (rank <> '') DESC, discord_id
         LIMIT 1
       ) dl ON TRUE
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
    uuid: playerUuid,
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
