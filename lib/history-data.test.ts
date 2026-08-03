import { describe, it, expect } from 'vitest';
import {
  buildExchangeStore,
  buildExchangeStoreFromRanged,
  mergeExchangeStores,
  buildSnapshotAt,
  expandSnapshot,
  ExchangeEventData,
  RangedExchangeEventData,
} from './history-data';
import { toAbbrev } from './territory-abbreviations';

// All timestamps post-Rekindled (cutoff 2024-08-10) so era filtering keeps
// these territories in scope for post-cutoff snapshot targets.
const T0 = Math.floor(new Date('2025-01-01T00:00:00Z').getTime() / 1000);
const HOUR = 3600;

const GUILDS = ['None', 'GuildA', 'GuildB'];
const PREFIXES = ['NON', 'GDA', 'GDB'];

function rangedChunk(
  territories: string[],
  events: number[][],
  initialState: number[][],
  earliestSec: number,
  latestSec: number,
): RangedExchangeEventData {
  return {
    territories,
    guilds: GUILDS,
    prefixes: PREFIXES,
    events,
    initialState,
    earliest: new Date(earliestSec * 1000).toISOString(),
    latest: new Date(latestSec * 1000).toISOString(),
  };
}

describe('buildExchangeStore', () => {
  it('precomputes abbreviations per territory index', () => {
    const data: ExchangeEventData = {
      territories: ['Detlas', 'Ragni'],
      guilds: GUILDS,
      prefixes: PREFIXES,
      events: [[T0, 0, 1], [T0 + HOUR, 1, 2]],
      earliest: new Date(T0 * 1000).toISOString(),
      latest: new Date((T0 + HOUR) * 1000).toISOString(),
    };
    const store = buildExchangeStore(data);
    expect(store.abbrevs).toEqual([toAbbrev('Detlas'), toAbbrev('Ragni')]);
  });
});

describe('buildSnapshotAt', () => {
  it('reconstructs ownership at a timestamp from ranged data', () => {
    const chunk = rangedChunk(
      ['Detlas', 'Ragni'],
      [
        [T0 + HOUR, 0, 2],      // Detlas → GuildB after 1h
      ],
      [
        [0, 1],                 // Detlas initially GuildA
        [1, 1],                 // Ragni initially GuildA
      ],
      T0,
      T0 + 2 * HOUR,
    );
    const store = buildExchangeStoreFromRanged(chunk);

    const before = buildSnapshotAt(store, new Date((T0 + HOUR / 2) * 1000));
    expect(before?.territories[toAbbrev('Detlas')]).toEqual({ g: 'GDA', n: 'GuildA' });
    expect(before?.territories[toAbbrev('Ragni')]).toEqual({ g: 'GDA', n: 'GuildA' });

    const after = buildSnapshotAt(store, new Date((T0 + 2 * HOUR) * 1000));
    expect(after?.territories[toAbbrev('Detlas')]).toEqual({ g: 'GDB', n: 'GuildB' });
    expect(after?.territories[toAbbrev('Ragni')]).toEqual({ g: 'GDA', n: 'GuildA' });
  });
});

describe('mergeExchangeStores', () => {
  it('remaps incoming indices and keeps events globally sorted', () => {
    const chunkA = rangedChunk(
      ['Detlas', 'Ragni'],
      [[T0 + HOUR, 0, 2]],
      [[0, 1], [1, 1]],
      T0,
      T0 + 2 * HOUR,
    );
    const store = buildExchangeStoreFromRanged(chunkA);

    // Incoming chunk lists the same territories in a DIFFERENT index order,
    // plus a new one; covers a later window.
    const laterStart = T0 + 10 * HOUR;
    const chunkB = rangedChunk(
      ['Ragni', 'Detlas', 'Detlas Suburbs'],
      [
        [laterStart + HOUR, 0, 2],  // Ragni → GuildB
        [laterStart + 2 * HOUR, 2, 1], // Detlas Suburbs → GuildA
      ],
      [
        [0, 1],  // Ragni at range start: GuildA
        [1, 2],  // Detlas at range start: GuildB
      ],
      laterStart,
      laterStart + 3 * HOUR,
    );

    const merged = mergeExchangeStores(store, chunkB);

    // Events sorted ascending
    for (let i = 1; i < merged.data.events.length; i++) {
      expect(merged.data.events[i][0]).toBeGreaterThanOrEqual(merged.data.events[i - 1][0]);
    }

    // No duplicate territory entries despite differing incoming order
    expect(merged.data.territories.filter(t => t === 'Ragni')).toHaveLength(1);
    expect(merged.data.territories).toContain('Detlas Suburbs');

    // Ownership before the second window still reflects chunk A
    const early = buildSnapshotAt(merged, new Date((T0 + HOUR / 2) * 1000));
    expect(early?.territories[toAbbrev('Detlas')]).toEqual({ g: 'GDA', n: 'GuildA' });

    // Ownership after the second window reflects chunk B's events
    const late = buildSnapshotAt(merged, new Date((laterStart + 3 * HOUR) * 1000));
    expect(late?.territories[toAbbrev('Ragni')]).toEqual({ g: 'GDB', n: 'GuildB' });
    expect(late?.territories[toAbbrev('Detlas')]).toEqual({ g: 'GDB', n: 'GuildB' });
    expect(late?.territories[toAbbrev('Detlas Suburbs')]).toEqual({ g: 'GDA', n: 'GuildA' });
  });

  it('matches a store built from the equivalent combined data', () => {
    const chunkA = rangedChunk(
      ['Detlas', 'Ragni'],
      [[T0 + HOUR, 0, 2], [T0 + 3 * HOUR, 1, 2]],
      [[0, 1], [1, 1]],
      T0,
      T0 + 4 * HOUR,
    );
    const chunkB = rangedChunk(
      ['Detlas', 'Ragni'],
      [[T0 + 6 * HOUR, 0, 1]],
      [[0, 2], [1, 2]],
      T0 + 5 * HOUR,
      T0 + 7 * HOUR,
    );

    const merged = mergeExchangeStores(buildExchangeStoreFromRanged(chunkA), chunkB);

    // Reference: all events loaded at once, globally sorted
    const combined: ExchangeEventData = {
      territories: ['Detlas', 'Ragni'],
      guilds: GUILDS,
      prefixes: PREFIXES,
      events: [
        [T0 - 1, 0, 1], [T0 - 1, 1, 1],                      // chunk A initial state
        [T0 + HOUR, 0, 2], [T0 + 3 * HOUR, 1, 2],            // chunk A events
        [T0 + 5 * HOUR - 1, 0, 2], [T0 + 5 * HOUR - 1, 1, 2], // chunk B initial state
        [T0 + 6 * HOUR, 0, 1],                                // chunk B events
      ],
      earliest: new Date(T0 * 1000).toISOString(),
      latest: new Date((T0 + 7 * HOUR) * 1000).toISOString(),
    };
    const reference = buildExchangeStore(combined);

    for (const probeSec of [T0 + HOUR / 2, T0 + 2 * HOUR, T0 + 4 * HOUR, T0 + 7 * HOUR]) {
      const a = buildSnapshotAt(merged, new Date(probeSec * 1000));
      const b = buildSnapshotAt(reference, new Date(probeSec * 1000));
      expect(a?.territories).toEqual(b?.territories);
    }
  });
});

describe('expandSnapshot identity reuse', () => {
  const verboseData = {
    Detlas: { Location: { start: [0, 0] as [number, number], end: [10, 10] as [number, number] } },
    Ragni: { Location: { start: [20, 20] as [number, number], end: [30, 30] as [number, number] } },
  };

  it('reuses territory object identity when the owner is unchanged', () => {
    const snapA = {
      [toAbbrev('Detlas')]: { g: 'GDA', n: 'GuildA' },
      [toAbbrev('Ragni')]: { g: 'GDA', n: 'GuildA' },
    };
    const first = expandSnapshot(snapA, verboseData);

    // New snapshot object, one owner changed
    const snapB = {
      [toAbbrev('Detlas')]: { g: 'GDB', n: 'GuildB' },
      [toAbbrev('Ragni')]: { g: 'GDA', n: 'GuildA' },
    };
    const second = expandSnapshot(snapB, verboseData);

    expect(second['Ragni']).toBe(first['Ragni']);          // identity preserved
    expect(second['Detlas']).not.toBe(first['Detlas']);    // changed owner → new object
    expect(second['Detlas'].guild.name).toBe('GuildB');
  });

  it('returns the previous result object when nothing changed', () => {
    const snapA = {
      [toAbbrev('Detlas')]: { g: 'GDA', n: 'GuildA' },
    };
    const first = expandSnapshot(snapA, verboseData);

    const snapAClone = {
      [toAbbrev('Detlas')]: { g: 'GDA', n: 'GuildA' },
    };
    const second = expandSnapshot(snapAClone, verboseData);
    expect(second).toBe(first);
  });
});
