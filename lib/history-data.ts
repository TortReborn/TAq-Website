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

/**
 * Expand a condensed snapshot into full Territory format.
 * Uses verbose data for location info since snapshots don't store coordinates.
 */
export function expandSnapshot(
  snapshotTerritories: Record<string, SnapshotTerritory>,
  verboseData: Record<string, { Location: { start: [number, number]; end: [number, number] } }> | null,
  guildColors?: Record<string, string>
): Record<string, Territory> {
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
 * Parse ISO timestamp strings to Date objects for a batch of snapshots
 */
export function parseSnapshots(snapshots: HistorySnapshot[]): ParsedSnapshot[] {
  return snapshots.map(s => ({
    timestamp: new Date(s.timestamp),
    territories: s.territories,
  }));
}

/**
 * Find the nearest snapshot to a target timestamp
 */
export function findNearestSnapshot(
  snapshots: ParsedSnapshot[],
  target: Date
): ParsedSnapshot | null {
  if (snapshots.length === 0) return null;

  let nearest = snapshots[0];
  let nearestDiff = Math.abs(target.getTime() - nearest.timestamp.getTime());

  for (const snapshot of snapshots) {
    const diff = Math.abs(target.getTime() - snapshot.timestamp.getTime());
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearest = snapshot;
    }
  }

  return nearest;
}

/**
 * Get the next snapshot after the current one
 */
export function getNextSnapshot(
  snapshots: ParsedSnapshot[],
  current: Date
): ParsedSnapshot | null {
  // Sort by timestamp
  const sorted = [...snapshots].sort((a, b) =>
    a.timestamp.getTime() - b.timestamp.getTime()
  );

  for (const snapshot of sorted) {
    if (snapshot.timestamp.getTime() > current.getTime()) {
      return snapshot;
    }
  }

  return null;
}

/**
 * Get the previous snapshot before the current one
 */
export function getPrevSnapshot(
  snapshots: ParsedSnapshot[],
  current: Date
): ParsedSnapshot | null {
  // Sort by timestamp descending
  const sorted = [...snapshots].sort((a, b) =>
    b.timestamp.getTime() - a.timestamp.getTime()
  );

  for (const snapshot of sorted) {
    if (snapshot.timestamp.getTime() < current.getTime()) {
      return snapshot;
    }
  }

  return null;
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
