/**
 * History data utilities for map snapshot storage and transformation.
 */

import { Territory } from "./utils";
import {
  toAbbrev,
  fromAbbrev,
  REKINDLED_WORLD_CUTOFF_MS,
  OLD_TERRITORY_NAMES,
  ROL_UPDATE_CUTOFF_MS,
  OLD_ROL_TERRITORY_NAMES,
} from "./territory-abbreviations";
import { mapLog } from "./map-logger";

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
  initialOwners?: Array<{ territory: string; guild: string }>;
}

// WeakMap cache for expanded snapshots — keyed on the snapshot territories
// object reference for zero-cost lookup. Auto-evicts when snapshots are GC'd.
const expandWeakCache = new WeakMap<Record<string, SnapshotTerritory>, Record<string, Territory>>();

// Previous expansion, kept so consecutive calls (e.g. scrub ticks, where the
// snapshot object is always freshly built) can reuse Territory object
// identities for territories whose owner didn't change. Stable identities let
// memoized overlay components skip re-rendering.
let _lastExpansion: {
  verboseData: unknown;
  snapshot: Record<string, SnapshotTerritory>;
  result: Record<string, Territory>;
  size: number;
} | null = null;

// Dev-only: track which "missing location" warnings we've already logged
// so we only log each territory name once per session.
const _warnedTerritories = new Set<string>();

/**
 * Expand a condensed snapshot into full Territory format.
 * Uses verbose data for location info since snapshots don't store coordinates.
 * Results are cached by object reference via WeakMap, and per-territory object
 * identities are reused across calls when a territory's owner is unchanged.
 */
export function expandSnapshot(
  snapshotTerritories: Record<string, SnapshotTerritory>,
  verboseData: Record<string, { Location: { start: [number, number]; end: [number, number] } }> | null
): Record<string, Territory> {
  // Only use cache when verboseData is available — without it, all territories
  // are skipped and caching the empty result would be permanently stale.
  if (verboseData) {
    const cached = expandWeakCache.get(snapshotTerritories);
    if (cached) return cached;
  }

  const prev = _lastExpansion && _lastExpansion.verboseData === verboseData ? _lastExpansion : null;
  const territories: Record<string, Territory> = {};
  let reused = 0;
  let size = 0;

  for (const [abbrev, data] of Object.entries(snapshotTerritories)) {
    const fullName = fromAbbrev(abbrev);
    const verbose = verboseData?.[fullName];

    if (!verbose?.Location) {
      // Skip territories without location data (e.g. one-off event territories
      // that appear in exchange history but have no coordinates). Logged once
      // through the structured map logger instead of a bare console.warn so
      // the console stays clean while the fact remains discoverable.
      if (typeof window !== 'undefined' && !_warnedTerritories.has(fullName)) {
        _warnedTerritories.add(fullName);
        mapLog('store', `no location data for territory "${fullName}"`, { abbrev });
      }
      continue;
    }

    size++;
    const prevSnap = prev?.snapshot[abbrev];
    if (prevSnap && prevSnap.g === data.g && prevSnap.n === data.n) {
      const prevTerr = prev!.result[fullName];
      if (prevTerr) {
        territories[fullName] = prevTerr;
        reused++;
        continue;
      }
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

  // Nothing changed since the previous expansion → return the previous result
  // object itself so downstream memos keyed on it skip entirely.
  if (prev && reused === size && size === prev.size) {
    if (verboseData) {
      expandWeakCache.set(snapshotTerritories, prev.result);
    }
    return prev.result;
  }

  if (verboseData) {
    expandWeakCache.set(snapshotTerritories, territories);
    _lastExpansion = { verboseData, snapshot: snapshotTerritories, result: territories, size };
  }
  return territories;
}

// ---------------------------------------------------------------------------
// Client-side exchange data reconstruction
// ---------------------------------------------------------------------------

/** Compact exchange event data — the ExchangeStore's flat storage format */
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
  /** Per-territory era classification derived from actual exchange timestamps */
  territoryEras: Array<'old' | 'new' | 'both'>;
  /** terrIdx → abbreviation (precomputed so snapshot builds skip toAbbrev lookups) */
  abbrevs: string[];
  /** Unix seconds of the earliest exchange across all territories */
  dataStartSec: number;
}

/** Build an ExchangeStore from raw API data. One-time cost on load. */
export function buildExchangeStore(data: ExchangeEventData): ExchangeStore {
  // Pre-allocate arrays per territory
  const territoryEvents: Array<[number, number]>[] = new Array(data.territories.length);
  for (let i = 0; i < data.territories.length; i++) {
    territoryEvents[i] = [];
  }

  // Precompute abbreviations per territory index
  const abbrevs: string[] = new Array(data.territories.length);
  for (let i = 0; i < data.territories.length; i++) {
    abbrevs[i] = toAbbrev(data.territories[i]);
  }

  for (const evt of data.events) {
    const [unixSec, tIdx, gIdx] = evt;
    territoryEvents[tIdx].push([unixSec, gIdx]);
  }

  // Events are already sorted by time from the API, but each territory's
  // sub-array may need sorting since the global sort interleaves territories.
  // The per-territory arrays ARE in order because we iterated the globally-
  // sorted events array — so no extra sort needed.

  // Classify each territory's era using both name-based knowledge and
  // exchange timestamps.  Name-based rules take priority:
  //   - Territories in OLD_TERRITORY_NAMES were removed in Rekindled World → 'old'
  //   - Remaining territories: data-driven from exchange timestamps, but
  //     if classified as 'both', verify the old-era data is substantial
  //     (not just a few stray events from bad backfill data).
  const REKINDLED_CUTOFF_SEC = Math.floor(REKINDLED_WORLD_CUTOFF_MS / 1000);
  const territoryEras: Array<'old' | 'new' | 'both'> = new Array(data.territories.length);
  for (let i = 0; i < territoryEvents.length; i++) {
    const terrName = data.territories[i];

    // Name-based override: territories explicitly removed in Rekindled World
    if (OLD_TERRITORY_NAMES.has(terrName)) {
      territoryEras[i] = 'old';
      continue;
    }

    // Data-driven classification for current-era territory names
    let oldCount = 0, newCount = 0;
    for (const [sec] of territoryEvents[i]) {
      if (sec < REKINDLED_CUTOFF_SEC) oldCount++;
      else newCount++;
    }

    if (oldCount > 0 && newCount > 0) {
      // Has exchanges on both sides.  If the old-era count is very small
      // relative to total (< 5% and fewer than 5 events), it's likely from
      // bad backfill data — treat as new-era-only.
      const total = oldCount + newCount;
      if (oldCount < 5 && oldCount / total < 0.05) {
        territoryEras[i] = 'new';
      } else {
        territoryEras[i] = 'both';
      }
    } else if (oldCount > 0) {
      territoryEras[i] = 'old';
    } else {
      territoryEras[i] = 'new';
    }
  }

  // Compute the earliest exchange timestamp across all territories
  let dataStartSec = Infinity;
  for (const evt of data.events) {
    if (evt[0] < dataStartSec) dataStartSec = evt[0];
  }
  if (!isFinite(dataStartSec)) dataStartSec = 0;

  return { data, territoryEvents, territoryEras, abbrevs, dataStartSec };
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

/** Pre-built lookup for initial owners (territory name → {guild, prefix}). */
export type InitialOwnerMap = Map<string, { guild: string; prefix: string }>;

/** Sanitize a guild prefix: must be 3+ alphabetic characters. */
function sanitizePrefix(prefix: string, guildName: string): string {
  if (prefix.length >= 3 && /^[A-Za-z]+$/.test(prefix)) return prefix;
  const alpha = guildName.replace(/[^A-Za-z]/g, '');
  return (alpha.length >= 3 ? alpha.substring(0, 3) : (alpha + 'XXX').substring(0, 3)).toUpperCase();
}

/** Build an InitialOwnerMap from bounds data + guild prefix lookup in the store. */
export function buildInitialOwnerMap(
  initialOwners: Array<{ territory: string; guild: string }>,
  store: ExchangeStore,
): InitialOwnerMap {
  // Build guild → prefix from the store's data
  const prefixByGuild = new Map<string, string>();
  for (let i = 0; i < store.data.guilds.length; i++) {
    prefixByGuild.set(store.data.guilds[i], store.data.prefixes[i]);
  }
  const map: InitialOwnerMap = new Map();
  for (const { territory, guild } of initialOwners) {
    const rawPrefix = prefixByGuild.get(guild) ?? '';
    map.set(territory, {
      guild,
      prefix: sanitizePrefix(rawPrefix, guild),
    });
  }
  return map;
}

/**
 * Reconstruct a single snapshot at any timestamp — client-side equivalent
 * of the server's `reconstructSingleSnapshot()`.
 *
 * For each territory, binary-searches its event history for the latest
 * owner at or before the requested time.  ~650 × log2(2500) ≈ 8K
 * comparisons — effectively instant.
 *
 * Forward-looking backfill: when a territory has no exchange before the
 * requested time, we look forward to its first exchange in the correct
 * era and use that guild as the owner.  This handles territories that
 * were held continuously from before data collection started.
 *
 * `initialOwners` — optional map of territory → {guild, prefix} for
 * territories whose first exchange has defender != 'None' (the guild
 * that held the territory before any recorded data).  Used as a
 * fallback; the forward-looking approach from the exchange store is
 * preferred.
 */
export function buildSnapshotAt(
  store: ExchangeStore,
  timestamp: Date,
  initialOwners?: InitialOwnerMap,
): ParsedSnapshot | null {
  const targetSec = Math.floor(timestamp.getTime() / 1000);
  const targetMs = timestamp.getTime();
  const isPostRekindled = targetMs >= REKINDLED_WORLD_CUTOFF_MS;
  const REKINDLED_CUTOFF_SEC = Math.floor(REKINDLED_WORLD_CUTOFF_MS / 1000);
  const { data, territoryEvents } = store;
  const territories: Record<string, SnapshotTerritory> = {};
  let count = 0;

  for (let tIdx = 0; tIdx < territoryEvents.length; tIdx++) {
    const events = territoryEvents[tIdx];
    const gIdx = lastEventBefore(events, targetSec);

    // Skip territories from the wrong era
    const era = store.territoryEras[tIdx];
    if (isPostRekindled && era === 'old') continue;
    if (!isPostRekindled && era === 'new') continue;

    // The original Realm of Light region was deleted in the Jan 2021 RoL
    // rework — its territories must not persist past that update
    if (targetMs >= ROL_UPDATE_CUTOFF_MS && OLD_ROL_TERRITORY_NAMES.has(data.territories[tIdx])) continue;

    if (gIdx === -1) {
      // No exchange before this time — forward-looking backfill.
      // Find the first exchange for this territory in the correct era
      // and use its guild as the owner (they held it up to that point).

      // Guard: only backfill territories that existed from the start.
      // If a territory's first exchange is more than 1 year after data
      // collection began, it was added in a later game update and should
      // never be backfilled — it simply didn't exist yet.
      if (events.length > 0) {
        const ONE_YEAR_SEC = 365 * 24 * 60 * 60;
        if (events[0][0] - store.dataStartSec > ONE_YEAR_SEC) continue;
      }

      let backfillGIdx = -1;

      // Search forward through events to find the first one in the correct era
      for (const [sec, guildIdx] of events) {
        if (sec <= targetSec) continue; // skip events before target (shouldn't exist since gIdx === -1, but be safe)
        // For pre-Rekindled: only use events from the old era
        if (!isPostRekindled && sec >= REKINDLED_CUTOFF_SEC) break; // past cutoff, stop
        // For post-Rekindled: only use events from the new era
        if (isPostRekindled && sec < REKINDLED_CUTOFF_SEC) continue; // skip old-era events

        // Found the first event in the correct era
        // Skip 'None' — find the first real guild
        if (data.guilds[guildIdx] !== 'None') {
          backfillGIdx = guildIdx;
          break;
        }
      }

      if (backfillGIdx !== -1) {
        territories[store.abbrevs[tIdx]] = {
          g: data.prefixes[backfillGIdx],
          n: data.guilds[backfillGIdx],
        };
        count++;
      } else if (initialOwners) {
        // Fallback to initialOwners (defender from first exchange in DB)
        const owner = initialOwners.get(data.territories[tIdx]);
        if (owner) {
          territories[store.abbrevs[tIdx]] = { g: owner.prefix, n: owner.guild };
          count++;
        }
      }
      continue;
    }

    const guildName = data.guilds[gIdx];
    if (guildName === 'None') continue;

    const abbrev = store.abbrevs[tIdx];

    territories[abbrev] = {
      g: data.prefixes[gIdx],
      n: guildName,
    };
    count++;
  }

  if (count === 0) return null;
  return { timestamp, territories };
}

// ---------------------------------------------------------------------------
// Ranged exchange data — for incremental loading from /api/map-history/events
// ---------------------------------------------------------------------------

/** Compact ranged exchange data returned by /api/map-history/events */
export interface RangedExchangeEventData {
  territories: string[];     // index → territory full name
  guilds: string[];          // index → guild name
  prefixes: string[];        // index → guild prefix (matches guilds order)
  events: number[][];        // [unixSec, terrIdx, guildIdx][]
  initialState: number[][];  // [terrIdx, guildIdx][] — ownership at range start
  earliest: string;          // ISO
  latest: string;            // ISO
}

/**
 * Build an ExchangeStore from ranged API data.
 *
 * Converts `initialState` entries into synthetic events at `(earliest - 1s)`
 * so that `lastEventBefore()` picks them up for any timestamp within the range.
 * Then delegates to the existing `buildExchangeStore()`.
 */
export function buildExchangeStoreFromRanged(data: RangedExchangeEventData): ExchangeStore {
  const startSec = Math.floor(new Date(data.earliest).getTime() / 1000) - 1;

  // Synthetic events from initial state (ownership at range start)
  const syntheticEvents: number[][] = data.initialState.map(
    ([tIdx, gIdx]) => [startSec, tIdx, gIdx]
  );

  const combinedData: ExchangeEventData = {
    territories: data.territories,
    guilds: data.guilds,
    prefixes: data.prefixes,
    events: [...syntheticEvents, ...data.events],
    earliest: data.earliest,
    latest: data.latest,
  };

  return buildExchangeStore(combinedData);
}

/**
 * Combine several ranged responses into one, so a batch of fetched chunks
 * costs a single merge into the (large) ExchangeStore instead of one full
 * store rebuild per chunk.
 *
 * Each chunk's `initialState` is pre-baked into synthetic events at that
 * chunk's own `earliest - 1s` — exactly what merging the chunk individually
 * would have produced — so combining preserves semantics even when the
 * chunks are non-contiguous. The result carries an empty `initialState`.
 */
export function combineRangedEventData(list: RangedExchangeEventData[]): RangedExchangeEventData {
  const territories: string[] = [];
  const terrIndex = new Map<string, number>();
  const guilds: string[] = [];
  const prefixes: string[] = [];
  const guildIndex = new Map<string, number>();
  const events: number[][] = [];
  let earliestMs = Infinity;
  let latestMs = -Infinity;

  for (const d of list) {
    const tMap = d.territories.map((name) => {
      let idx = terrIndex.get(name);
      if (idx === undefined) {
        idx = territories.length;
        territories.push(name);
        terrIndex.set(name, idx);
      }
      return idx;
    });
    const gMap = d.guilds.map((name, i) => {
      let idx = guildIndex.get(name);
      if (idx === undefined) {
        idx = guilds.length;
        guilds.push(name);
        prefixes.push(d.prefixes[i]);
        guildIndex.set(name, idx);
      }
      return idx;
    });

    const startSec = Math.floor(new Date(d.earliest).getTime() / 1000) - 1;
    for (const [tIdx, gIdx] of d.initialState) {
      events.push([startSec, tMap[tIdx], gMap[gIdx]]);
    }
    for (const [sec, tIdx, gIdx] of d.events) {
      events.push([sec, tMap[tIdx], gMap[gIdx]]);
    }
    earliestMs = Math.min(earliestMs, new Date(d.earliest).getTime());
    latestMs = Math.max(latestMs, new Date(d.latest).getTime());
  }

  // Chunks may arrive out of order (the background fill alternates directions)
  events.sort((a, b) => a[0] - b[0]);

  return {
    territories,
    guilds,
    prefixes,
    events,
    initialState: [],
    earliest: new Date(earliestMs === Infinity ? 0 : earliestMs).toISOString(),
    latest: new Date(latestMs === -Infinity ? 0 : latestMs).toISOString(),
  };
}

/**
 * Merge a new ranged response into an existing ExchangeStore.
 *
 * Handles index remapping: incoming data may use different indices for the
 * same territory/guild names. We build a mapping via hash lookups, translate
 * the incoming events, then merge the two already-sorted event arrays in
 * O(existing + incoming) — no global re-sort.
 */
export function mergeExchangeStores(
  existing: ExchangeStore,
  incoming: RangedExchangeEventData,
): ExchangeStore {
  // Clone existing data arrays
  const territories = [...existing.data.territories];
  const guilds = [...existing.data.guilds];
  const prefixes = [...existing.data.prefixes];

  // Build index maps: incoming index → merged index (hash lookup, not indexOf)
  const terrIndex = new Map<string, number>();
  for (let i = 0; i < territories.length; i++) terrIndex.set(territories[i], i);
  const terrMap: number[] = incoming.territories.map(name => {
    const idx = terrIndex.get(name);
    if (idx !== undefined) return idx;
    const newIdx = territories.length;
    territories.push(name);
    terrIndex.set(name, newIdx);
    return newIdx;
  });

  const guildIndex = new Map<string, number>();
  for (let i = 0; i < guilds.length; i++) guildIndex.set(guilds[i], i);
  const guildMap: number[] = incoming.guilds.map((name, i) => {
    const idx = guildIndex.get(name);
    if (idx !== undefined) return idx;
    const newIdx = guilds.length;
    guilds.push(name);
    prefixes.push(incoming.prefixes[i]);
    guildIndex.set(name, newIdx);
    return newIdx;
  });

  // Translated incoming events: synthetic initial-state events (all at
  // startSec, which precedes every real event in the range) followed by the
  // range's real events — the result is sorted ascending by construction.
  const startSec = Math.floor(new Date(incoming.earliest).getTime() / 1000) - 1;
  const incomingEvents: number[][] = new Array(incoming.initialState.length + incoming.events.length);
  let w = 0;
  for (const [tIdx, gIdx] of incoming.initialState) {
    incomingEvents[w++] = [startSec, terrMap[tIdx], guildMap[gIdx]];
  }
  for (const [sec, tIdx, gIdx] of incoming.events) {
    incomingEvents[w++] = [sec, terrMap[tIdx], guildMap[gIdx]];
  }

  // Merge the two sorted arrays in linear time
  const existingEvents = existing.data.events;
  const events: number[][] = new Array(existingEvents.length + incomingEvents.length);
  let i = 0, j = 0, k = 0;
  while (i < existingEvents.length && j < incomingEvents.length) {
    events[k++] = existingEvents[i][0] <= incomingEvents[j][0]
      ? existingEvents[i++]
      : incomingEvents[j++];
  }
  while (i < existingEvents.length) events[k++] = existingEvents[i++];
  while (j < incomingEvents.length) events[k++] = incomingEvents[j++];

  // Update bounds
  const mergedData: ExchangeEventData = {
    territories,
    guilds,
    prefixes,
    events,
    earliest: new Date(Math.min(
      new Date(existing.data.earliest).getTime(),
      new Date(incoming.earliest).getTime(),
    )).toISOString(),
    latest: new Date(Math.max(
      new Date(existing.data.latest).getTime(),
      new Date(incoming.latest).getTime(),
    )).toISOString(),
  };

  return buildExchangeStore(mergedData);
}
