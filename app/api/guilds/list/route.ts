import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Returns all known guild names + prefixes from the guild_prefixes table.
 * Lightweight endpoint used by the factions panel so every guild is searchable,
 * not just those currently holding territory.
 */
export async function GET() {
  const pool = getPool();

  try {
    const result = await pool.query(
      'SELECT guild_name, guild_prefix FROM guild_prefixes ORDER BY guild_name'
    );

    const guilds: string[] = [];
    const prefixes: string[] = [];
    for (const row of result.rows) {
      guilds.push(row.guild_name);
      prefixes.push(row.guild_prefix ?? '');
    }

    return NextResponse.json({ guilds, prefixes }, {
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch (error) {
    console.error('Error fetching guild list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch guild list' },
      { status: 500 }
    );
  }
}
