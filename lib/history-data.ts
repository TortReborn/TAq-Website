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
