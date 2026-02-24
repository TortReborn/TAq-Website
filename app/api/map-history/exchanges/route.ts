import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { USE_TEST_DATA, getTestExchangeEvents } from '@/lib/test-history-data';
import { getFullCoverageTime } from '@/lib/exchange-data';

export const dynamic = 'force-dynamic';

/**
 * Returns ALL exchange events in a compact indexed format for client-side
 * snapshot reconstruction.  The client loads this once on history enter and
 * then navigates freely without further API calls.
 *
 * Response shape:
 *   territories: string[]   – index → territory full name
 *   guilds:      string[]   – index → guild name
 *   prefixes:    string[]   – index → guild prefix (matches guilds order)
 *   events:      number[][] – [[unix_seconds, terr_idx, guild_idx], ...]
 *   earliest:    string     – ISO timestamp (full-coverage start)
 *   latest:      string     – ISO timestamp (last exchange)
 */
export async function GET(_request: NextRequest) {
  if (USE_TEST_DATA) {
    return NextResponse.json(getTestExchangeEvents(), {
      headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
    });
  }

  const pool = getPool();

  try {
    // Fetch guild prefixes
    const prefixResult = await pool.query(
      'SELECT guild_name, guild_prefix FROM guild_prefixes'
    );
    const guildPrefixMap = new Map<string, string>();
    for (const row of prefixResult.rows) {
      guildPrefixMap.set(row.guild_name, row.guild_prefix);
    }

    // Fetch all unique exchange events, ordered by time.
    // DISTINCT ON removes duplicate rows (same time+territory+attacker).
    const result = await pool.query(`
      SELECT DISTINCT ON (exchange_time, territory, attacker_name)
             exchange_time, territory, attacker_name
      FROM territory_exchanges
      ORDER BY exchange_time ASC, territory, attacker_name
    `);

    // Build compact indexed representation.
    // The exchange data contains paired entries: when guild A takes territory X,
    // two rows are recorded at the same timestamp — one for A (new owner) and
    // one for "None" (old owner leaving).  We must drop the "None" entry when
    // a non-None entry exists at the same (timestamp, territory), otherwise
    // the client-side binary search picks up "None" and the territory appears
    // unclaimed.  Rows are sorted by (time, territory, attacker_name), so
    // entries for the same time+territory are adjacent — we buffer and flush.

    const territoryIndex = new Map<string, number>();
    const territories: string[] = [];
    const guildIndex = new Map<string, number>();
    const guilds: string[] = [];
    const prefixes: string[] = [];
    const events: number[][] = [];

    function getOrCreateTerrIdx(territory: string): number {
      let tIdx = territoryIndex.get(territory);
      if (tIdx === undefined) {
        tIdx = territories.length;
        territoryIndex.set(territory, tIdx);
        territories.push(territory);
      }
      return tIdx;
    }

    function getOrCreateGuildIdx(guild: string): number {
      let gIdx = guildIndex.get(guild);
      if (gIdx === undefined) {
        gIdx = guilds.length;
        guildIndex.set(guild, gIdx);
        guilds.push(guild);
        prefixes.push(
          guildPrefixMap.get(guild) ?? guild.substring(0, 3).toUpperCase()
        );
      }
      return gIdx;
    }

    // Buffer rows for same (timestamp, territory) group, then flush
    type Row = { exchange_time: Date; territory: string; attacker_name: string };
    let buffer: Row[] = [];

    function flushBuffer() {
      if (buffer.length === 0) return;
      const hasNonNone = buffer.some(r => r.attacker_name !== 'None');
      for (const r of buffer) {
        // Drop None entries when a real guild exists at the same time+territory
        if (hasNonNone && r.attacker_name === 'None') continue;

        const unixSec = Math.floor(r.exchange_time.getTime() / 1000);
        events.push([unixSec, getOrCreateTerrIdx(r.territory), getOrCreateGuildIdx(r.attacker_name)]);
      }
      buffer = [];
    }

    for (const row of result.rows) {
      const unixSec = Math.floor(row.exchange_time.getTime() / 1000);
      const bufSec = buffer.length > 0 ? Math.floor(buffer[0].exchange_time.getTime() / 1000) : -1;

      if (buffer.length > 0 && (unixSec !== bufSec || row.territory !== buffer[0].territory)) {
        flushBuffer();
      }
      buffer.push(row);
    }
    flushBuffer();

    // Compute bounds
    const coverageTime = await getFullCoverageTime(pool);
    const earliest = coverageTime
      ? coverageTime.toISOString()
      : events.length > 0
        ? new Date(events[0][0] * 1000).toISOString()
        : new Date().toISOString();
    const latest = events.length > 0
      ? new Date(events[events.length - 1][0] * 1000).toISOString()
      : new Date().toISOString();

    return NextResponse.json({
      territories,
      guilds,
      prefixes,
      events,
      earliest,
      latest,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching exchange events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange events' },
      { status: 500 }
    );
  }
}
