import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  reconstructSingleSnapshot,
  reconstructSnapshotsFromExchanges,
  getExchangeBounds,
  exchangesHaveDataNear,
  _resetPrefixCache,
} from './exchange-data';
import { TERRITORY_TO_ABBREV } from './territory-abbreviations';
import type { Pool } from 'pg';

// Reset the module-level caches before each test
beforeEach(() => {
  _resetPrefixCache();
});

// ---------------------------------------------------------------------------
// Mock pool helper
// ---------------------------------------------------------------------------
type QueryResult = { rows: Record<string, unknown>[] };

function createMockPool(responses: QueryResult[]): Pool {
  let callIndex = 0;
  return {
    query: vi.fn(async () => {
      if (callIndex >= responses.length) {
        return { rows: [] };
      }
      return responses[callIndex++];
    }),
  } as unknown as Pool;
}

// ---------------------------------------------------------------------------
// reconstructSingleSnapshot
//
// Query order: 1) guild_prefixes  2) DISTINCT ON <= timestamp
// ---------------------------------------------------------------------------
describe('reconstructSingleSnapshot', () => {
  it('returns null when no exchanges exist at all', async () => {
    const pool = createMockPool([
      { rows: [] },  // guild_prefixes
      { rows: [] },  // DISTINCT ON query
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));
    expect(result).toBeNull();
  });

  it('reconstructs a snapshot from exchanges', async () => {
    const pool = createMockPool([
      // guild_prefixes
      { rows: [
        { guild_name: 'The Aquarium', guild_prefix: 'TAq' },
        { guild_name: 'Dern Empire', guild_prefix: 'ERN' },
      ]},
      // DISTINCT ON query — latest owner per territory
      { rows: [
        { territory: 'Detlas', attacker_name: 'The Aquarium' },
        { territory: 'Ragni', attacker_name: 'Dern Empire' },
      ]},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));

    expect(result).not.toBeNull();
    expect(result!.timestamp).toBe('2023-06-01T00:00:00.000Z');
    expect(result!.territories['DET']).toEqual({ g: 'TAq', n: 'The Aquarium' });
    expect(result!.territories['RAG']).toEqual({ g: 'ERN', n: 'Dern Empire' });
  });

  it('skips territories where attacker is "None" (unclaimed)', async () => {
    const pool = createMockPool([
      { rows: [] }, // guild_prefixes (empty — fallback)
      { rows: [
        { territory: 'Detlas', attacker_name: 'None' },
        { territory: 'Ragni', attacker_name: 'SomeGuild' },
      ]},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));
    expect(result).not.toBeNull();
    // Detlas should NOT appear (attacker is "None")
    expect(result!.territories['DET']).toBeUndefined();
    // Ragni should appear with fallback prefix "SOM"
    expect(result!.territories['RAG']).toEqual({ g: 'SOM', n: 'SomeGuild' });
  });

  it('uses fallback prefix (first 3 chars) when guild not in prefix table', async () => {
    const pool = createMockPool([
      { rows: [] }, // empty guild_prefixes
      { rows: [
        { territory: 'Almuj', attacker_name: 'banana empire' },
      ]},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));
    expect(result!.territories['ALM']).toEqual({ g: 'BAN', n: 'banana empire' });
  });

  it('only shows territories that have exchanged before the timestamp', async () => {
    // Territories with no exchange before the timestamp should NOT appear.
    // Only Detlas has an exchange before the timestamp.
    const pool = createMockPool([
      { rows: [
        { guild_name: 'Guild A', guild_prefix: 'GA' },
      ]},
      // DISTINCT ON: only Detlas has an exchange before the timestamp
      { rows: [
        { territory: 'Detlas', attacker_name: 'Guild A' },
      ]},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2022-03-01'));
    expect(result).not.toBeNull();

    // Detlas: appears from DISTINCT ON result
    expect(result!.territories['DET']).toEqual({ g: 'GA', n: 'Guild A' });
    // Ragni and Almuj: no exchange before timestamp, should NOT appear
    expect(result!.territories['RAG']).toBeUndefined();
    expect(result!.territories['ALM']).toBeUndefined();
  });

  it('returns null at the very start before any exchanges', async () => {
    // At the very beginning before any exchanges, no territories should appear.
    const pool = createMockPool([
      { rows: [] }, // guild_prefixes
      // DISTINCT ON: nothing before this timestamp
      { rows: [] },
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2021-09-20'));
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reconstructSnapshotsFromExchanges (10-minute interval output)
//
// Query order: 1) guild_prefixes  2) DISTINCT ON <= start  3) exchanges in range
// ---------------------------------------------------------------------------
describe('reconstructSnapshotsFromExchanges', () => {
  it('returns empty array when no data exists', async () => {
    const pool = createMockPool([
      { rows: [] }, // guild_prefixes
      { rows: [] }, // initial state (DISTINCT ON)
      { rows: [] }, // exchanges in range
    ]);

    const result = await reconstructSnapshotsFromExchanges(
      pool,
      new Date('2023-06-01'),
      new Date('2023-06-08'),
    );
    expect(result).toEqual([]);
  });

  it('produces regular 10-minute interval snapshots over the range', async () => {
    // 1-hour range → should produce 7 snapshots (at 0, 10, 20, 30, 40, 50, 60 min)
    const pool = createMockPool([
      { rows: [{ guild_name: 'Guild A', guild_prefix: 'GA' }] },
      { rows: [{ territory: 'Detlas', attacker_name: 'Guild A' }] },
      { rows: [] }, // no exchanges
    ]);

    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-01T01:00:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    expect(result).toHaveLength(7);
    for (const snap of result) {
      expect(snap.territories['DET']).toEqual({ g: 'GA', n: 'Guild A' });
    }
    expect(result[0].timestamp).toBe('2023-06-01T00:00:00.000Z');
    expect(result[1].timestamp).toBe('2023-06-01T00:10:00.000Z');
    expect(result[6].timestamp).toBe('2023-06-01T01:00:00.000Z');
  });

  it('applies exchanges at the correct 10-minute tick', async () => {
    const exchangeTime = new Date('2023-06-01T00:15:00Z');

    const pool = createMockPool([
      { rows: [
        { guild_name: 'Guild A', guild_prefix: 'GA' },
        { guild_name: 'Guild B', guild_prefix: 'GB' },
      ]},
      { rows: [{ territory: 'Detlas', attacker_name: 'Guild A' }] },
      { rows: [
        { exchange_time: exchangeTime, territory: 'Detlas', attacker_name: 'Guild B' },
      ]},
    ]);

    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-01T00:30:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    expect(result).toHaveLength(4);
    expect(result[0].territories['DET'].n).toBe('Guild A');
    expect(result[1].territories['DET'].n).toBe('Guild A');
    expect(result[2].territories['DET'].n).toBe('Guild B'); // :20, exchange at :15
    expect(result[3].territories['DET'].n).toBe('Guild B');
  });

  it('handles exchange at exact tick boundary', async () => {
    const exchangeTime = new Date('2023-06-01T00:10:00Z');

    const pool = createMockPool([
      { rows: [] },
      { rows: [{ territory: 'Ragni', attacker_name: 'Guild A' }] },
      { rows: [
        { exchange_time: exchangeTime, territory: 'Ragni', attacker_name: 'Guild B' },
      ]},
    ]);

    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-01T00:20:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    expect(result).toHaveLength(3);
    expect(result[0].territories['RAG'].n).toBe('Guild A');
    expect(result[1].territories['RAG'].n).toBe('Guild B'); // applied at :10
    expect(result[2].territories['RAG'].n).toBe('Guild B');
  });

  it('skips ticks before any territory state is known', async () => {
    const exchangeTime = new Date('2023-06-01T00:20:00Z');

    const pool = createMockPool([
      { rows: [] },
      { rows: [] }, // empty initial state
      { rows: [
        { exchange_time: exchangeTime, territory: 'Detlas', attacker_name: 'Guild A' },
      ]},
    ]);

    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-01T00:30:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBe('2023-06-01T00:20:00.000Z');
    expect(result[1].timestamp).toBe('2023-06-01T00:30:00.000Z');
  });

  it('progressively populates territories as exchanges occur', async () => {
    // Start with empty state. Territories appear only when first exchanged.
    const pool = createMockPool([
      { rows: [
        { guild_name: 'Guild A', guild_prefix: 'GA' },
        { guild_name: 'Guild B', guild_prefix: 'GB' },
      ]},
      // DISTINCT ON: no exchanges before startDate
      { rows: [] },
      // Exchanges in range: territories appear one by one
      { rows: [
        { exchange_time: new Date('2021-10-01T00:05:00Z'), territory: 'Detlas', attacker_name: 'Guild A' },
        { exchange_time: new Date('2021-10-01T00:15:00Z'), territory: 'Almuj', attacker_name: 'Guild B' },
        { exchange_time: new Date('2021-10-01T00:25:00Z'), territory: 'Ragni', attacker_name: 'Guild A' },
      ]},
    ]);

    const start = new Date('2021-10-01T00:00:00Z');
    const end = new Date('2021-10-01T00:30:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    // :00 — no state yet, skipped
    // :10 — Detlas appeared (exchange at :05)
    expect(result[0].timestamp).toBe('2021-10-01T00:10:00.000Z');
    expect(Object.keys(result[0].territories)).toHaveLength(1);
    expect(result[0].territories['DET'].n).toBe('Guild A');

    // :20 — Almuj also appeared (exchange at :15)
    expect(result[1].timestamp).toBe('2021-10-01T00:20:00.000Z');
    expect(Object.keys(result[1].territories)).toHaveLength(2);
    expect(result[1].territories['ALM'].n).toBe('Guild B');

    // :30 — Ragni also appeared (exchange at :25)
    expect(result[2].timestamp).toBe('2021-10-01T00:30:00.000Z');
    expect(Object.keys(result[2].territories)).toHaveLength(3);
    expect(result[2].territories['RAG'].n).toBe('Guild A');
  });

  it('clock-aligns snapshots to 10-minute boundaries', async () => {
    // Start at a non-aligned time (00:03:00), should floor to 00:00:00
    const pool = createMockPool([
      { rows: [] },
      { rows: [{ territory: 'Detlas', attacker_name: 'Guild A' }] },
      { rows: [] }, // no exchanges in range
    ]);

    const start = new Date('2023-06-01T00:03:00Z');
    const end = new Date('2023-06-01T00:23:00Z');
    const result = await reconstructSnapshotsFromExchanges(pool, start, end);

    // Should start at :00 (floored), then :10, :20
    expect(result).toHaveLength(3);
    expect(result[0].timestamp).toBe('2023-06-01T00:00:00.000Z');
    expect(result[1].timestamp).toBe('2023-06-01T00:10:00.000Z');
    expect(result[2].timestamp).toBe('2023-06-01T00:20:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// Full territory snapshot reconstruction (all 290+ territories)
// ---------------------------------------------------------------------------
describe('full territory snapshot reconstruction', () => {
  it('reconstructs a complete snapshot covering all known territories', async () => {
    const allTerritories = Object.keys(TERRITORY_TO_ABBREV);
    const guildName = 'TestGuild';

    const pool = createMockPool([
      // guild_prefixes
      { rows: [{ guild_name: guildName, guild_prefix: 'TG' }] },
      // Every territory owned by the same guild
      { rows: allTerritories.map(name => ({
        territory: name,
        attacker_name: guildName,
      }))},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));
    expect(result).not.toBeNull();

    for (const [fullName, abbrev] of Object.entries(TERRITORY_TO_ABBREV)) {
      expect(result!.territories[abbrev]).toBeDefined();
      expect(result!.territories[abbrev]).toEqual({ g: 'TG', n: guildName });
    }

    const snapshotCount = Object.keys(result!.territories).length;
    expect(snapshotCount).toBe(allTerritories.length);
  });

  it('handles mixed guilds across all territories', async () => {
    const allTerritories = Object.keys(TERRITORY_TO_ABBREV);
    const guilds = ['Alpha', 'Bravo', 'Charlie', 'Delta'];

    const pool = createMockPool([
      { rows: guilds.map(g => ({
        guild_name: g,
        guild_prefix: g.substring(0, 3).toUpperCase(),
      }))},
      { rows: allTerritories.map((name, i) => ({
        territory: name,
        attacker_name: guilds[i % guilds.length],
      }))},
    ]);

    const result = await reconstructSingleSnapshot(pool, new Date('2023-06-01'));
    expect(result).not.toBeNull();

    const count = Object.keys(result!.territories).length;
    expect(count).toBe(allTerritories.length);

    const firstAbbrev = TERRITORY_TO_ABBREV[allTerritories[0]];
    expect(result!.territories[firstAbbrev].n).toBe('Alpha');
    const secondAbbrev = TERRITORY_TO_ABBREV[allTerritories[1]];
    expect(result!.territories[secondAbbrev].n).toBe('Bravo');
  });
});

// ---------------------------------------------------------------------------
// Playback simulation
// ---------------------------------------------------------------------------
describe('playback simulation', () => {
  it('correctly steps through territory changes over 2 hours', async () => {
    const start = new Date('2023-06-01T10:00:00Z');
    const end = new Date('2023-06-01T12:00:00Z');

    const pool = createMockPool([
      { rows: [
        { guild_name: 'Guild A', guild_prefix: 'GA' },
        { guild_name: 'Guild B', guild_prefix: 'GB' },
        { guild_name: 'Guild C', guild_prefix: 'GC' },
      ]},
      // Initial state
      { rows: [
        { territory: 'Detlas', attacker_name: 'Guild A' },
        { territory: 'Ragni', attacker_name: 'Guild A' },
        { territory: 'Almuj', attacker_name: 'Guild C' },
      ]},
      // Exchanges in chronological order
      { rows: [
        { exchange_time: new Date('2023-06-01T10:25:00Z'), territory: 'Ragni', attacker_name: 'Guild B' },
        { exchange_time: new Date('2023-06-01T10:45:00Z'), territory: 'Detlas', attacker_name: 'Guild C' },
        { exchange_time: new Date('2023-06-01T11:10:00Z'), territory: 'Ragni', attacker_name: 'Guild A' },
        { exchange_time: new Date('2023-06-01T11:30:00Z'), territory: 'Almuj', attacker_name: 'Guild B' },
      ]},
    ]);

    const snapshots = await reconstructSnapshotsFromExchanges(pool, start, end);

    // 2 hours = 13 snapshots (10:00, 10:10, ..., 12:00)
    expect(snapshots).toHaveLength(13);

    const at = (time: string) => {
      const snap = snapshots.find(s => s.timestamp === time);
      expect(snap).toBeDefined();
      return snap!.territories;
    };

    // 10:00 — initial state
    expect(at('2023-06-01T10:00:00.000Z')['DET'].n).toBe('Guild A');
    expect(at('2023-06-01T10:00:00.000Z')['RAG'].n).toBe('Guild A');
    expect(at('2023-06-01T10:00:00.000Z')['ALM'].n).toBe('Guild C');

    // 10:20 — still initial
    expect(at('2023-06-01T10:20:00.000Z')['RAG'].n).toBe('Guild A');

    // 10:30 — Guild B took Ragni at 10:25
    expect(at('2023-06-01T10:30:00.000Z')['RAG'].n).toBe('Guild B');
    expect(at('2023-06-01T10:30:00.000Z')['DET'].n).toBe('Guild A');

    // 10:50 — Guild C took Detlas at 10:45
    expect(at('2023-06-01T10:50:00.000Z')['DET'].n).toBe('Guild C');
    expect(at('2023-06-01T10:50:00.000Z')['RAG'].n).toBe('Guild B');

    // 11:10 — Guild A took Ragni back
    expect(at('2023-06-01T11:10:00.000Z')['RAG'].n).toBe('Guild A');

    // 11:30 — Guild B took Almuj
    expect(at('2023-06-01T11:30:00.000Z')['ALM'].n).toBe('Guild B');

    // 12:00 — final state
    expect(at('2023-06-01T12:00:00.000Z')['DET'].n).toBe('Guild C');
    expect(at('2023-06-01T12:00:00.000Z')['RAG'].n).toBe('Guild A');
    expect(at('2023-06-01T12:00:00.000Z')['ALM'].n).toBe('Guild B');
  });

  it('produces snapshots dense enough for the 30-minute gap threshold', async () => {
    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-08T00:00:00Z');

    const pool = createMockPool([
      { rows: [] },
      { rows: [{ territory: 'Detlas', attacker_name: 'Guild A' }] },
      { rows: [
        { exchange_time: new Date('2023-06-03T12:05:00Z'), territory: 'Detlas', attacker_name: 'Guild B' },
        { exchange_time: new Date('2023-06-06T08:33:00Z'), territory: 'Detlas', attacker_name: 'Guild A' },
      ]},
    ]);

    const snapshots = await reconstructSnapshotsFromExchanges(pool, start, end);

    // 7 days × 24 hours × 6 per hour + 1 = 1009 snapshots
    expect(snapshots).toHaveLength(1009);

    for (let i = 1; i < snapshots.length; i++) {
      const prev = new Date(snapshots[i - 1].timestamp).getTime();
      const curr = new Date(snapshots[i].timestamp).getTime();
      expect(curr - prev).toBe(10 * 60 * 1000);
    }

    const beforeExchange = snapshots.find(s => s.timestamp === '2023-06-03T12:00:00.000Z');
    const afterExchange = snapshots.find(s => s.timestamp === '2023-06-03T12:10:00.000Z');
    expect(beforeExchange!.territories['DET'].n).toBe('Guild A');
    expect(afterExchange!.territories['DET'].n).toBe('Guild B');
  });

  it('correctly handles stepping forward and backward through snapshots', async () => {
    const start = new Date('2023-06-01T00:00:00Z');
    const end = new Date('2023-06-01T01:00:00Z');

    const pool = createMockPool([
      { rows: [
        { guild_name: 'G1', guild_prefix: 'G1' },
        { guild_name: 'G2', guild_prefix: 'G2' },
      ]},
      { rows: [{ territory: 'Detlas', attacker_name: 'G1' }] },
      { rows: [
        { exchange_time: new Date('2023-06-01T00:25:00Z'), territory: 'Detlas', attacker_name: 'G2' },
      ]},
    ]);

    const snapshots = await reconstructSnapshotsFromExchanges(pool, start, end);

    let idx = 0;
    expect(snapshots[idx].territories['DET'].n).toBe('G1');
    idx = 1;
    expect(snapshots[idx].territories['DET'].n).toBe('G1');
    idx = 2;
    expect(snapshots[idx].territories['DET'].n).toBe('G1');
    idx = 3;
    expect(snapshots[idx].territories['DET'].n).toBe('G2');
    idx = 2;
    expect(snapshots[idx].territories['DET'].n).toBe('G1');
    idx = 3;
    expect(snapshots[idx].territories['DET'].n).toBe('G2');
  });
});

// ---------------------------------------------------------------------------
// getExchangeBounds — returns raw MIN/MAX exchange_time
// ---------------------------------------------------------------------------
describe('getExchangeBounds', () => {
  it('returns raw MIN as earliest', async () => {
    const earliest = new Date('2018-06-15T00:04:32Z');
    const latest = new Date('2025-05-13T00:00:00Z');
    const pool = createMockPool([
      { rows: [{ earliest, latest }] },
    ]);

    const result = await getExchangeBounds(pool);
    expect(result).toEqual({ earliest, latest });
  });

  it('returns null when table is empty', async () => {
    const pool = createMockPool([
      { rows: [{ earliest: null, latest: null }] },
    ]);

    const result = await getExchangeBounds(pool);
    expect(result).toBeNull();
  });

  it('returns null on query error (table missing)', async () => {
    const pool = {
      query: vi.fn(async () => { throw new Error('relation does not exist'); }),
    } as unknown as Pool;

    const result = await getExchangeBounds(pool);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exchangesHaveDataNear
// ---------------------------------------------------------------------------
describe('exchangesHaveDataNear', () => {
  it('returns true when exchanges exist near the timestamp', async () => {
    const pool = createMockPool([
      { rows: [{ '1': 1 }] },
    ]);

    const result = await exchangesHaveDataNear(pool, new Date('2023-06-01'));
    expect(result).toBe(true);
  });

  it('returns false when no exchanges near the timestamp', async () => {
    const pool = createMockPool([
      { rows: [] },
    ]);

    const result = await exchangesHaveDataNear(pool, new Date('2030-01-01'));
    expect(result).toBe(false);
  });

  it('returns false on error', async () => {
    const pool = {
      query: vi.fn(async () => { throw new Error('connection failed'); }),
    } as unknown as Pool;

    const result = await exchangesHaveDataNear(pool, new Date('2023-06-01'));
    expect(result).toBe(false);
  });
});
