/**
 * Client-side persistent cache for history exchange data.
 *
 * Strategy:
 *   - Non-empty segments (containing real territory events) are cached
 *     permanently — historical data never changes.
 *   - Empty segments (gaps with no data) are tracked separately and
 *     always re-checked on fresh visits because new data may be ingested.
 *
 * Storage:
 *   - IndexedDB "history-cache" DB for the large ExchangeEventData blob.
 *   - localStorage for lightweight range metadata.
 */

import type { ExchangeEventData } from './history-data';

const DB_NAME = 'history-cache';
const DB_VERSION = 1;
const STORE_NAME = 'exchange-data';
const DATA_KEY = 'exchange-store';

// localStorage keys
const LS_DATA_RANGES = 'historyCache:dataRanges';   // ranges with actual events
const LS_EMPTY_RANGES = 'historyCache:emptyRanges';  // ranges that were empty (re-check)
const LS_CACHE_VERSION = 'historyCache:version';
const CACHE_VERSION = '1';

// ---------------------------------------------------------------------------
// IndexedDB helpers
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail — cache is optional
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently fail
  }
}

// ---------------------------------------------------------------------------
// Range helpers (localStorage)
// ---------------------------------------------------------------------------

function loadRanges(key: string): Array<[number, number]> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as Array<[number, number]>;
  } catch {
    return [];
  }
}

function saveRanges(key: string, ranges: Array<[number, number]>): void {
  try {
    localStorage.setItem(key, JSON.stringify(ranges));
  } catch {
    // Silently fail — quota exceeded, etc.
  }
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1]);
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CachedHistoryData {
  exchangeData: ExchangeEventData;
  dataRanges: Array<[number, number]>;   // ranges with real events (don't re-fetch)
  emptyRanges: Array<[number, number]>;  // ranges that were empty (re-check)
}

/**
 * Load cached exchange data from IndexedDB + range metadata from localStorage.
 * Returns null if no cache exists or the cache version doesn't match.
 */
export async function loadCachedHistory(): Promise<CachedHistoryData | null> {
  try {
    // Check cache version
    const version = localStorage.getItem(LS_CACHE_VERSION);
    if (version !== CACHE_VERSION) {
      await clearHistoryCache();
      return null;
    }

    const exchangeData = await idbGet<ExchangeEventData>(DATA_KEY);
    if (!exchangeData) return null;

    const dataRanges = loadRanges(LS_DATA_RANGES);
    const emptyRanges = loadRanges(LS_EMPTY_RANGES);

    if (dataRanges.length === 0) return null;

    return { exchangeData, dataRanges, emptyRanges };
  } catch {
    return null;
  }
}

/**
 * Save exchange data and range metadata to persistent cache.
 * Call this after merging new chunks into the store.
 *
 * @param exchangeData The full merged ExchangeEventData
 * @param allRanges    All loaded ranges [startMs, endMs][]
 * @param gaps         Known data gaps from the API bounds response
 */
export async function saveHistoryCache(
  exchangeData: ExchangeEventData,
  allRanges: Array<[number, number]>,
  gaps?: Array<{ start: string; end: string }>,
): Promise<void> {
  try {
    // Classify ranges into "has data" vs "empty"
    const gapIntervals = (gaps ?? []).map(g => [
      new Date(g.start).getTime(),
      new Date(g.end).getTime(),
    ] as [number, number]);

    const dataRanges: Array<[number, number]> = [];
    const emptyRanges: Array<[number, number]> = [];

    for (const [rStart, rEnd] of allRanges) {
      // Check how much of this range overlaps with known gaps
      let gapOverlap = 0;
      for (const [gStart, gEnd] of gapIntervals) {
        const overlapStart = Math.max(rStart, gStart);
        const overlapEnd = Math.min(rEnd, gEnd);
        if (overlapEnd > overlapStart) {
          gapOverlap += overlapEnd - overlapStart;
        }
      }

      const rangeSize = rEnd - rStart;
      if (rangeSize > 0 && gapOverlap / rangeSize > 0.9) {
        // Range is >90% gap — treat as empty, re-check next time
        emptyRanges.push([rStart, rEnd]);
      } else {
        // Range has real data — cache permanently
        dataRanges.push([rStart, rEnd]);
      }
    }

    // Save to IndexedDB + localStorage
    await idbSet(DATA_KEY, exchangeData);
    saveRanges(LS_DATA_RANGES, mergeRanges(dataRanges));
    saveRanges(LS_EMPTY_RANGES, mergeRanges(emptyRanges));
    localStorage.setItem(LS_CACHE_VERSION, CACHE_VERSION);
  } catch {
    // Silently fail — cache is optional
  }
}

/**
 * Clear all cached history data.
 */
export async function clearHistoryCache(): Promise<void> {
  try {
    await idbDelete(DATA_KEY);
    localStorage.removeItem(LS_DATA_RANGES);
    localStorage.removeItem(LS_EMPTY_RANGES);
    localStorage.removeItem(LS_CACHE_VERSION);
  } catch {
    // Silently fail
  }
}
