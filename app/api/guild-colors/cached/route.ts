import { NextRequest, NextResponse } from 'next/server';
import simpleDatabaseCache from '@/lib/db-cache-simple';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Load auto-generated fallback colors from the guild_generated_colors table.
 * These are deterministic hash-based colors for guilds without API colors.
 */
async function loadGeneratedColors(): Promise<Record<string, string>> {
  try {
    const pool = getPool();
    const result = await pool.query('SELECT guild_name, color FROM guild_generated_colors');
    const colors: Record<string, string> = {};
    for (const row of result.rows) {
      colors[row.guild_name] = row.color;
    }
    return colors;
  } catch {
    // Table may not exist yet — return empty
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    // Load API-sourced colors and generated fallbacks in parallel
    const [cachedGuilds, generatedColors] = await Promise.all([
      simpleDatabaseCache.getGuildColors('server'),
      loadGeneratedColors(),
    ]);

    // Start with generated colors as the base layer (fallbacks)
    const guildColors: Record<string, string> = { ...generatedColors };

    // Overlay API-sourced colors — these take priority over generated ones
    if (cachedGuilds && Array.isArray(cachedGuilds)) {
      for (const guild of cachedGuilds) {
        if (guild.color) {
          if (guild._id) {
            guildColors[guild._id] = guild.color;
          }
          if (guild.prefix) {
            guildColors[guild.prefix] = guild.color;
          }
        }
      }
    }

    const cacheStatus = cachedGuilds && Array.isArray(cachedGuilds) ? 'HIT' : 'EMPTY';

    return NextResponse.json(
      { guildColors },
      {
        status: 200,
        headers: {
          'X-Cache': cacheStatus,
          'X-Cache-Source': 'PostgreSQL'
        }
      }
    );

  } catch (error) {
    console.error('Error reading cached guild colors:', error);
    return NextResponse.json(
      { guildColors: {} },
      {
        status: 200,
        headers: {
          'X-Cache': 'ERROR',
          'X-Cache-Source': 'PostgreSQL-Fallback'
        }
      }
    );
  }
}