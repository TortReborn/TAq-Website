import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Returns exchange events for a bounded time range in compact indexed format,
 * plus the initial territory ownership state at the range start.
 *
 * This is much smaller than pre-built snapshots (~1.5MB vs ~13MB per 3 months)
 * and enables instant client-side reconstruction via buildSnapshotAt().
 *
 * Response shape:
 *   territories:  string[]   – index → territory full name
 *   guilds:       string[]   – index → guild name
 *   prefixes:     string[]   – index → guild prefix
 *   events:       number[][] – [[unix_seconds, terr_idx, guild_idx], ...]
 *   initialState: number[][] – [[terr_idx, guild_idx], ...] (ownership at start)
 *   earliest:     string     – ISO timestamp of first event in range
 *   latest:       string     – ISO timestamp of last event in range
 */

// Maximum allowed range per request (6 months)
const MAX_RANGE_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startParam = searchParams.get('start');
  const endParam = searchParams.get('end');

  if (!startParam || !endParam) {
    return NextResponse.json(
      { error: 'Missing start and end parameters' },
      { status: 400 }
    );
  }

  const startDate = new Date(startParam);
  let endDate = new Date(endParam);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json(
      { error: 'Invalid start or end timestamp' },
      { status: 400 }
    );
  }

  // Clamp range
  if (endDate.getTime() - startDate.getTime() > MAX_RANGE_MS) {
    endDate = new Date(startDate.getTime() + MAX_RANGE_MS);
  }

  const pool = getPool();

  try {
    // Fetch guild prefixes (small table, cached by connection pool)
    const prefixResult = await pool.query(
      'SELECT guild_name, guild_prefix FROM guild_prefixes'
    );
    const guildPrefixMap = new Map<string, string>();
    for (const row of prefixResult.rows) {
      guildPrefixMap.set(row.guild_name, row.guild_prefix);
    }

    // 1. Initial state: latest owner per territory at or before startDate
    const initialResult = await pool.query(
      `SELECT DISTINCT ON (territory) territory, attacker_name
       FROM territory_exchanges
       WHERE exchange_time <= $1
       ORDER BY territory, exchange_time DESC,
                CASE WHEN attacker_name = 'None' THEN 1 ELSE 0 END`,
      [startDate.toISOString()]
    );

    // 2. Events within the range (simple range scan, fast with index)
    const eventsResult = await pool.query(
      `SELECT exchange_time, territory, attacker_name
       FROM territory_exchanges
       WHERE exchange_time > $1 AND exchange_time <= $2
       ORDER BY exchange_time ASC, territory, attacker_name`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    // Build compact indexed representation
    const territoryIndex = new Map<string, number>();
    const territories: string[] = [];
    const guildIndex = new Map<string, number>();
    const guilds: string[] = [];
    const prefixes: string[] = [];

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

    // Encode initial state
    const initialState: number[][] = [];
    for (const row of initialResult.rows) {
      initialState.push([
        getOrCreateTerrIdx(row.territory),
        getOrCreateGuildIdx(row.attacker_name),
      ]);
    }

    // Encode events with buffer/flush None-dedup (same pattern as /exchanges)
    type Row = { exchange_time: Date; territory: string; attacker_name: string };
    let buffer: Row[] = [];
    const events: number[][] = [];

    function flushBuffer() {
      if (buffer.length === 0) return;
      const hasNonNone = buffer.some(r => r.attacker_name !== 'None');
      for (const r of buffer) {
        if (hasNonNone && r.attacker_name === 'None') continue;
        const unixSec = Math.floor(r.exchange_time.getTime() / 1000);
        events.push([unixSec, getOrCreateTerrIdx(r.territory), getOrCreateGuildIdx(r.attacker_name)]);
      }
      buffer = [];
    }

    for (const row of eventsResult.rows) {
      const unixSec = Math.floor(row.exchange_time.getTime() / 1000);
      const bufSec = buffer.length > 0 ? Math.floor(buffer[0].exchange_time.getTime() / 1000) : -1;

      if (buffer.length > 0 && (unixSec !== bufSec || row.territory !== buffer[0].territory)) {
        flushBuffer();
      }
      buffer.push(row);
    }
    flushBuffer();

    const earliest = events.length > 0
      ? new Date(events[0][0] * 1000).toISOString()
      : startDate.toISOString();
    const latest = events.length > 0
      ? new Date(events[events.length - 1][0] * 1000).toISOString()
      : endDate.toISOString();

    return NextResponse.json({
      territories,
      guilds,
      prefixes,
      events,
      initialState,
      earliest,
      latest,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (error) {
    console.error('Error fetching ranged exchange events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exchange events' },
      { status: 500 }
    );
  }
}
