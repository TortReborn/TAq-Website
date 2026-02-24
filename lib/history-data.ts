/**
 * History data utilities for map snapshot storage and transformation.
 */

import { Territory } from "./utils";
import { toAbbrev, fromAbbrev, ABBREV_TO_TERRITORY } from "./territory-abbreviations";

// Condensed snapshot format for database storage
export interface SnapshotTerritory {
  g: string;  // Guild prefix
  n: string;  // Guild name
}

// Full snapshot as stored in database
export interface HistorySnapshot {
  timestamp: string;
  territories: Record<string, SnapshotTerritory>;
}

// Snapshot with parsed timestamp for easier manipulation
export interface ParsedSnapshot {
  timestamp: Date;
  territories: Record<string, SnapshotTerritory>;
}

// Bounds response from API
export interface HistoryBounds {
  earliest: string;
  latest: string;
  gaps?: Array<{ start: string; end: string }>;
}

// Week response from API
export interface WeekResponse {
  snapshots: HistorySnapshot[];
}

// WeakMap cache for expanded snapshots — keyed on the snapshot territories
// object reference for zero-cost lookup. Auto-evicts when snapshots are GC'd.
const expandWeakCache = new WeakMap<Record<string, SnapshotTerritory>, Record<string, Territory>>();

/**
 * Expand a condensed snapshot into full Territory format.
 * Uses verbose data for location info since snapshots don't store coordinates.
 * Results are cached by object reference via WeakMap.
 */
export function expandSnapshot(
  snapshotTerritories: Record<string, SnapshotTerritory>,
  verboseData: Record<string, { Location: { start: [number, number]; end: [number, number] } }> | null,
  guildColors?: Record<string, string>
): Record<string, Territory> {
  const cached = expandWeakCache.get(snapshotTerritories);
  if (cached) return cached;

  const territories: Record<string, Territory> = {};

  for (const [abbrev, data] of Object.entries(snapshotTerritories)) {
    const fullName = fromAbbrev(abbrev);
    const verbose = verboseData?.[fullName];

    if (!verbose?.Location) {
      // Skip territories without location data
      continue;
    }

    territories[fullName] = {
      guild: {
        uuid: "",  // Not stored in snapshots
        name: data.n,
        prefix: data.g,
      },
      acquired: "",  // Not stored in snapshots
      location: {
        start: verbose.Location.start,
        end: verbose.Location.end,
      },
    };
  }

  expandWeakCache.set(snapshotTerritories, territories);
  return territories;
}

/**
 * Compress current territory data into condensed snapshot format.
 * Used by the external bot to create snapshots.
 */
export function compressToSnapshot(
  territories: Record<string, Territory>
): Record<string, SnapshotTerritory> {
  const snapshot: Record<string, SnapshotTerritory> = {};

  for (const [name, territory] of Object.entries(territories)) {
    const abbrev = toAbbrev(name);

    // Only store claimed territories
    if (territory.guild.name && territory.guild.name !== "Unclaimed") {
      snapshot[abbrev] = {
        g: territory.guild.prefix,
        n: territory.guild.name,
      };
    }
  }

  return snapshot;
}

/**
 * Parse ISO timestamp strings to Date objects for a batch of snapshots.
 * Returns snapshots sorted ascending by timestamp for binary search.
 */
export function parseSnapshots(snapshots: HistorySnapshot[]): ParsedSnapshot[] {
  return snapshots
    .map(s => ({
      timestamp: new Date(s.timestamp),
      territories: s.territories,
    }))
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Binary search for the index of the nearest snapshot to a target time.
 * Assumes snapshots are sorted ascending by timestamp.
 * Returns the index, or -1 if the array is empty.
 */
export function binarySearchNearest(
  snapshots: ParsedSnapshot[],
  targetMs: number
): number {
  if (snapshots.length === 0) return -1;

  let lo = 0;
  let hi = snapshots.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (snapshots[mid].timestamp.getTime() < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // lo is now the first index >= targetMs
  if (lo === 0) return 0;

  const diffLo = Math.abs(snapshots[lo].timestamp.getTime() - targetMs);
  const diffPrev = Math.abs(snapshots[lo - 1].timestamp.getTime() - targetMs);

  return diffPrev <= diffLo ? lo - 1 : lo;
}

/**
 * Find the nearest snapshot to a target timestamp.
 * Uses binary search on the pre-sorted array — O(log n).
 */
export function findNearestSnapshot(
  snapshots: ParsedSnapshot[],
  target: Date
): ParsedSnapshot | null {
  const idx = binarySearchNearest(snapshots, target.getTime());
  return idx === -1 ? null : snapshots[idx];
}

/**
 * Get the next snapshot after the current timestamp.
 * Binary search for first element > current — O(log n).
 */
export function getNextSnapshot(
  snapshots: ParsedSnapshot[],
  current: Date
): ParsedSnapshot | null {
  const targetMs = current.getTime();
  let lo = 0, hi = snapshots.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (snapshots[mid].timestamp.getTime() <= targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo < snapshots.length ? snapshots[lo] : null;
}

/**
 * Get the previous snapshot before the current timestamp.
 * Binary search for last element < current — O(log n).
 */
export function getPrevSnapshot(
  snapshots: ParsedSnapshot[],
  current: Date
): ParsedSnapshot | null {
  const targetMs = current.getTime();
  let lo = 0, hi = snapshots.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (snapshots[mid].timestamp.getTime() < targetMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // lo is the first index >= targetMs, so lo-1 is the last < targetMs
  return lo > 0 ? snapshots[lo - 1] : null;
}

/**
 * Merge new snapshots into an existing sorted array, deduplicating by timestamp.
 * Both inputs must be sorted ascending by timestamp.
 * Caps at maxSnapshots if provided.
 */
export function mergeSnapshots(
  existing: ParsedSnapshot[],
  incoming: ParsedSnapshot[],
  maxSnapshots?: number
): ParsedSnapshot[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingTimestamps = new Set(existing.map(s => s.timestamp.getTime()));
  const newOnly = incoming.filter(s => !existingTimestamps.has(s.timestamp.getTime()));

  if (newOnly.length === 0) return existing;

  const merged = [...existing, ...newOnly].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  if (maxSnapshots && merged.length > maxSnapshots) {
    return merged.slice(merged.length - maxSnapshots);
  }

  return merged;
}

/**
 * Check if a timestamp is within a week of the center
 */
export function isWithinWeek(timestamp: Date, center: Date): boolean {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const diff = Math.abs(timestamp.getTime() - center.getTime());
  return diff <= WEEK_MS / 2;
}

/**
 * Check if we need to load more snapshots based on current position
 * Returns the direction to load: 'forward', 'backward', or null
 */
export function checkNeedMoreSnapshots(
  currentTimestamp: Date,
  loadedWeekCenter: Date,
  playDirection: 'forward' | 'backward'
): 'forward' | 'backward' | null {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const diff = currentTimestamp.getTime() - loadedWeekCenter.getTime();

  // If within 1 day of the edge in the play direction, preload
  if (playDirection === 'forward' && diff > 2.5 * DAY_MS) {
    return 'forward';
  }
  if (playDirection === 'backward' && diff < -2.5 * DAY_MS) {
    return 'backward';
  }

  return null;
}

/**
 * Format a timestamp for display
 */
export function formatHistoryTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format a timestamp for short display (timeline)
 */
export function formatShortTimestamp(date: Date): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Get all known territory full names
 */
export function getAllTerritoryNames(): string[] {
  return Object.values(ABBREV_TO_TERRITORY);
}

// ---------------------------------------------------------------------------
// Client-side exchange data reconstruction
// ---------------------------------------------------------------------------

/** Compact exchange data returned by /api/map-history/exchanges */
export interface ExchangeEventData {
  territories: string[];     // index → territory full name
  guilds: string[];          // index → guild name
  prefixes: string[];        // index → guild prefix (matches guilds order)
  events: number[][];        // [unixSec, terrIdx, guildIdx][]
  earliest: string;          // ISO
  latest: string;            // ISO
}

/**
 * Pre-processed exchange data for fast client-side lookups.
 * Groups events by territory so we can binary-search each territory's
 * history independently.
 */
export interface ExchangeStore {
  data: ExchangeEventData;
  /** terrIdx → sorted array of [unixSec, guildIdx] pairs */
  territoryEvents: Array<[number, number]>[];
}

/** Build an ExchangeStore from raw API data. One-time cost on load. */
export function buildExchangeStore(data: ExchangeEventData): ExchangeStore {
  // Pre-allocate arrays per territory
  const territoryEvents: Array<[number, number]>[] = new Array(data.territories.length);
  for (let i = 0; i < data.territories.length; i++) {
    territoryEvents[i] = [];
  }

  for (const evt of data.events) {
    const [unixSec, tIdx, gIdx] = evt;
    territoryEvents[tIdx].push([unixSec, gIdx]);
  }

  // Events are already sorted by time from the API, but each territory's
  // sub-array may need sorting since the global sort interleaves territories.
  // The per-territory arrays ARE in order because we iterated the globally-
  // sorted events array — so no extra sort needed.

  return { data, territoryEvents };
}

/**
 * Binary search for the last event at or before `targetSec` in a
 * sorted [unixSec, guildIdx][] array.  Returns the guild index,
 * or -1 if no event exists at or before targetSec.
 */
function lastEventBefore(
  events: Array<[number, number]>,
  targetSec: number,
): number {
  if (events.length === 0) return -1;

  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid][0] <= targetSec) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  // lo is now the first index > targetSec, so lo-1 is the last ≤ targetSec
  return lo > 0 ? events[lo - 1][1] : -1;
}

/**
 * Reconstruct a single snapshot at any timestamp — client-side equivalent
 * of the server's `reconstructSingleSnapshot()`.
 *
 * For each territory, binary-searches its event history for the latest
 * owner at or before the requested time.  ~650 × log2(2500) ≈ 8K
 * comparisons — effectively instant.
 */
export function buildSnapshotAt(
  store: ExchangeStore,
  timestamp: Date,
): ParsedSnapshot | null {
  const targetSec = Math.floor(timestamp.getTime() / 1000);
  const { data, territoryEvents } = store;
  const territories: Record<string, SnapshotTerritory> = {};
  let count = 0;

  for (let tIdx = 0; tIdx < territoryEvents.length; tIdx++) {
    const gIdx = lastEventBefore(territoryEvents[tIdx], targetSec);
    if (gIdx === -1) continue;

    const guildName = data.guilds[gIdx];
    if (guildName === 'None') continue;

    const abbrev = toAbbrev(data.territories[tIdx]);
    territories[abbrev] = {
      g: data.prefixes[gIdx],
      n: guildName,
    };
    count++;
  }

  if (count === 0) return null;
  return { timestamp, territories };
}

const SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Floor a timestamp to the nearest 10-minute clock boundary */
function floorTo10Min(ms: number): number {
  return ms - (ms % SNAPSHOT_INTERVAL_MS);
}

/**
 * Reconstruct snapshots at 10-minute intervals over a time range —
 * client-side equivalent of the server's `reconstructSnapshotsFromExchanges()`.
 *
 * Uses the same walk-forward algorithm: build initial state at startDate,
 * then step through 10-minute ticks applying exchanges as they occur.
 */
export function buildSnapshotsInRange(
  store: ExchangeStore,
  startDate: Date,
  endDate: Date,
): ParsedSnapshot[] {
  const { data, territoryEvents } = store;
  const startSec = Math.floor(startDate.getTime() / 1000);
  const endMs = endDate.getTime();

  // Build initial state: latest guild per territory at startDate
  const state = new Map<number, number>(); // terrIdx → guildIdx
  for (let tIdx = 0; tIdx < territoryEvents.length; tIdx++) {
    const gIdx = lastEventBefore(territoryEvents[tIdx], startSec);
    if (gIdx !== -1) {
      state.set(tIdx, gIdx);
    }
  }

  // Collect all exchanges in the range into a flat sorted array
  // for efficient walk-forward.
  const rangeEvents: Array<[number, number, number]> = []; // [unixSec, terrIdx, guildIdx]
  const endSec = Math.floor(endDate.getTime() / 1000);
  for (const evt of data.events) {
    const [sec, tIdx, gIdx] = evt;
    if (sec > startSec && sec <= endSec) {
      rangeEvents.push([sec, tIdx, gIdx]);
    }
    if (sec > endSec) break; // events are sorted, can stop early
  }

  // If no state and no events, nothing to show
  if (state.size === 0 && rangeEvents.length === 0) {
    return [];
  }

  // Walk forward in 10-minute clock-aligned steps
  const snapshots: ParsedSnapshot[] = [];
  let exchIdx = 0;
  const startTick = floorTo10Min(startDate.getTime());

  for (let t = startTick; t <= endMs; t += SNAPSHOT_INTERVAL_MS) {
    const tickSec = Math.floor(t / 1000);

    // Apply exchanges up to this tick
    while (exchIdx < rangeEvents.length && rangeEvents[exchIdx][0] <= tickSec) {
      state.set(rangeEvents[exchIdx][1], rangeEvents[exchIdx][2]);
      exchIdx++;
    }

    // Only emit once we have territory state
    if (state.size > 0) {
      const territories: Record<string, SnapshotTerritory> = {};
      for (const [tIdx, gIdx] of state) {
        const guildName = data.guilds[gIdx];
        if (guildName === 'None') continue;
        const abbrev = toAbbrev(data.territories[tIdx]);
        territories[abbrev] = {
          g: data.prefixes[gIdx],
          n: guildName,
        };
      }
      snapshots.push({ timestamp: new Date(t), territories });
    }
  }

  return snapshots;
}
