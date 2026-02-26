/**
 * Reconstruct territory snapshots from the territory_exchanges table.
 *
 * The exchanges table stores individual ownership-change events:
 *   (exchange_time, territory, attacker_name, defender_name)
 *
 * To produce the same HistorySnapshot format the frontend expects, we:
 *   1. Compute the full territory state at a given point in time
 *   2. Walk forward through exchanges, emitting a snapshot per change-event
 *
 * Guild prefixes come from the guild_prefixes lookup table (populated by the
 * import script). Results are cached in-module to avoid repeated DB reads.
 */

import { Pool } from "pg";
import { toAbbrev, OLD_TERRITORY_NAMES, REKINDLED_WORLD_CUTOFF_MS } from "./territory-abbreviations";
import type { HistorySnapshot, SnapshotTerritory } from "./history-data";

// ---------------------------------------------------------------------------
// Guild prefix cache  (small table – load once, refresh hourly)
// ---------------------------------------------------------------------------
let prefixCache: Map<string, string> | null = null;
let prefixCacheTime = 0;
const PREFIX_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// ---------------------------------------------------------------------------
// (Removed) Full-coverage time cache — previously used to delay the timeline
// start until every territory had been exchanged at least once.  This hid
// sparse early data (2018-2020).  Now we use the raw MIN(exchange_time).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gap cache — periods longer than 1 week with no exchange data.
// ---------------------------------------------------------------------------
let gapCache: Array<{ start: Date; end: Date }> | null = null;
let gapCacheTime = 0;

/** Reset caches (used by tests). */
export function _resetPrefixCache() {
  prefixCache = null;
  prefixCacheTime = 0;
  gapCache = null;
  gapCacheTime = 0;
}

async function getGuildPrefixes(pool: Pool): Promise<Map<string, string>> {
  if (prefixCache && Date.now() - prefixCacheTime < PREFIX_CACHE_TTL) {
    return prefixCache;
  }

  try {
    const result = await pool.query("SELECT guild_name, guild_prefix FROM guild_prefixes");
    const map = new Map<string, string>();
    for (const row of result.rows) {
      map.set(row.guild_name, row.guild_prefix);
    }
    prefixCache = map;
    prefixCacheTime = Date.now();
    return map;
  } catch {
    // Table might not exist yet — return empty map
    return prefixCache ?? new Map();
  }
}

function guildPrefix(prefixes: Map<string, string>, guildName: string): string {
  return prefixes.get(guildName) ?? guildName.substring(0, 3).toUpperCase();
}

// ---------------------------------------------------------------------------
// (Removed) getFullCoverageTime — previously delayed the timeline start until
// every territory had at least one exchange.  This pushed the start to April
// 2021 when 2018-2020 data existed in the DB.  Now getExchangeBounds() uses
// the raw MIN(exchange_time) directly.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Gap detection — find periods > 7 days with no exchange data.
// ---------------------------------------------------------------------------

const GAP_THRESHOLD_DAYS = 1;

export async function getExchangeGaps(
  pool: Pool,
): Promise<Array<{ start: Date; end: Date }>> {
  if (gapCache && Date.now() - gapCacheTime < PREFIX_CACHE_TTL) {
    return gapCache;
  }

  try {
    const result = await pool.query(`
      WITH daily AS (
        SELECT DISTINCT DATE_TRUNC('day', exchange_time)::date AS d
        FROM territory_exchanges
      ), with_next AS (
        SELECT d, LEAD(d) OVER (ORDER BY d) AS next_d
        FROM daily
      )
      SELECT d AS gap_start, next_d AS gap_end
      FROM with_next
      WHERE next_d - d > $1
    `, [GAP_THRESHOLD_DAYS]);

    gapCache = result.rows.map((row: { gap_start: Date; gap_end: Date }) => ({
      start: new Date(row.gap_start),
      end: new Date(row.gap_end),
    }));
    gapCacheTime = Date.now();
    return gapCache;
  } catch {
    return gapCache ?? [];
  }
}

// ---------------------------------------------------------------------------
// Build a snapshot territories object from current state
// ---------------------------------------------------------------------------
function stateToTerritories(
  state: Map<string, string>,          // territory full name → guild name
  prefixes: Map<string, string>,       // guild name → prefix
  timestampMs?: number,                // filter old territories for post-Rekindled timestamps
): Record<string, SnapshotTerritory> {
  const isPostRekindled = timestampMs !== undefined && timestampMs >= REKINDLED_WORLD_CUTOFF_MS;
  const territories: Record<string, SnapshotTerritory> = {};
  for (const [territory, guild] of state) {
    if (guild === "None") continue;    // unclaimed
    if (isPostRekindled && OLD_TERRITORY_NAMES.has(territory)) continue;
    const abbrev = toAbbrev(territory);
    territories[abbrev] = {
      g: guildPrefix(prefixes, guild),
      n: guild,
    };
  }
  return territories;
}

// ---------------------------------------------------------------------------
// Check whether the exchanges table has data covering a timestamp
// ---------------------------------------------------------------------------
export async function exchangesHaveDataNear(
  pool: Pool,
  timestamp: Date,
  toleranceMs = 7 * 24 * 60 * 60 * 1000, // 1 week
): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM territory_exchanges
       WHERE exchange_time BETWEEN $1 AND $2
       LIMIT 1`,
      [
        new Date(timestamp.getTime() - toleranceMs).toISOString(),
        new Date(timestamp.getTime() + toleranceMs).toISOString(),
      ]
    );
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Reconstruct a single snapshot at a specific timestamp
// ---------------------------------------------------------------------------
export async function reconstructSingleSnapshot(
  pool: Pool,
  timestamp: Date,
): Promise<HistorySnapshot | null> {
  const prefixes = await getGuildPrefixes(pool);

  // Build state ONLY from exchanges that actually occurred at or before this
  // timestamp. Territories only appear once their first exchange happens.
  const state = new Map<string, string>();

  // When multiple exchanges share the same timestamp for a territory
  // (a "None" entry for the old owner + a guild entry for the new owner),
  // the CASE tiebreaker ensures DISTINCT ON picks the non-None entry.
  const result = await pool.query(
    `SELECT DISTINCT ON (territory) territory, attacker_name
     FROM territory_exchanges
     WHERE exchange_time <= $1
     ORDER BY territory, exchange_time DESC,
              CASE WHEN attacker_name = 'None' THEN 1 ELSE 0 END`,
    [timestamp.toISOString()]
  );

  for (const row of result.rows) {
    state.set(row.territory, row.attacker_name);
  }

  if (state.size === 0) return null;

  return {
    timestamp: timestamp.toISOString(),
    territories: stateToTerritories(state, prefixes, timestamp.getTime()),
  };
}

// ---------------------------------------------------------------------------
// Reconstruct snapshots at regular 10-minute intervals within a time range.
//
// Produces the same dense snapshot stream as the bot (one per 10 min),
// carrying forward the last known territory state and applying exchanges
// as they occur. This ensures the frontend's 30-minute gap threshold is
// always satisfied.
// ---------------------------------------------------------------------------
const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Floor a timestamp to the nearest 10-minute clock boundary */
function floorTo10Min(ms: number): number {
  return ms - (ms % SNAPSHOT_INTERVAL_MS);
}

export async function reconstructSnapshotsFromExchanges(
  pool: Pool,
  startDate: Date,
  endDate: Date,
): Promise<HistorySnapshot[]> {
  const prefixes = await getGuildPrefixes(pool);

  // 1. Start with EMPTY state — territories appear only when first exchanged
  const state = new Map<string, string>();

  // 2. Populate with latest state at startDate for territories
  //    that have exchanged at or before startDate
  // CASE tiebreaker: prefer non-None when multiple exchanges share a timestamp
  const initialResult = await pool.query(
    `SELECT DISTINCT ON (territory) territory, attacker_name
     FROM territory_exchanges
     WHERE exchange_time <= $1
     ORDER BY territory, exchange_time DESC,
              CASE WHEN attacker_name = 'None' THEN 1 ELSE 0 END`,
    [startDate.toISOString()]
  );

  for (const row of initialResult.rows) {
    state.set(row.territory, row.attacker_name);
  }

  // 3. All exchanges within the range, ordered chronologically.
  //    Sort None BEFORE non-None at the same timestamp so that
  //    state.set() overwrites None with the real guild (last write wins).
  const exchangesResult = await pool.query(
    `SELECT exchange_time, territory, attacker_name
     FROM territory_exchanges
     WHERE exchange_time > $1 AND exchange_time <= $2
     ORDER BY exchange_time ASC, territory,
              CASE WHEN attacker_name = 'None' THEN 0 ELSE 1 END`,
    [startDate.toISOString(), endDate.toISOString()]
  );

  // If no territory state at all (empty database), nothing to show
  if (state.size === 0 && exchangesResult.rows.length === 0) {
    return [];
  }

  // 4. Walk forward in 10-minute steps aligned to clock boundaries,
  //    applying exchanges as we go
  const snapshots: HistorySnapshot[] = [];
  const exchanges = exchangesResult.rows;
  let exchIdx = 0;

  const startTick = floorTo10Min(startDate.getTime());

  for (
    let t = startTick;
    t <= endDate.getTime();
    t += SNAPSHOT_INTERVAL_MS
  ) {
    // Apply every exchange that occurred up to (and including) this tick
    while (
      exchIdx < exchanges.length &&
      exchanges[exchIdx].exchange_time.getTime() <= t
    ) {
      state.set(
        exchanges[exchIdx].territory,
        exchanges[exchIdx].attacker_name,
      );
      exchIdx++;
    }

    // Only emit once we have at least some territory state
    if (state.size > 0) {
      snapshots.push({
        timestamp: new Date(t).toISOString(),
        territories: stateToTerritories(state, prefixes, t),
      });
    }
  }

  return snapshots;
}

// ---------------------------------------------------------------------------
// Get the time bounds of the exchanges table.
// `earliest` is the raw MIN(exchange_time) so the timeline starts at the
// actual first data point — even if many territories are empty early on.
// ---------------------------------------------------------------------------
export async function getExchangeBounds(
  pool: Pool,
): Promise<{ earliest: Date; latest: Date } | null> {
  try {
    const result = await pool.query(
      `SELECT MIN(exchange_time) AS earliest, MAX(exchange_time) AS latest
       FROM territory_exchanges`
    );
    const row = result.rows[0];
    if (!row?.earliest || !row?.latest) return null;

    return {
      earliest: new Date(row.earliest),
      latest: new Date(row.latest),
    };
  } catch {
    return null;
  }
}
