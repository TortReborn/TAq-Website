import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { checkRateLimit, incrementRateLimit, createRateLimitResponse, addRateLimitHeaders } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Powers the landing page's animated stat counters. All public data, no auth needed.

const GUILD_PREFIX = 'TAq';
const GUILD_PROFILE_URL = `https://api.wynncraft.com/v3/guild/prefix/${GUILD_PREFIX}`;
const LEADERBOARD_BASE_URL = 'https://api.wynncraft.com/v3/leaderboards';
const FETCH_HEADERS = { 'User-Agent': 'tort-reborn-web/1.0' };

interface GuildProfile {
  level: number;
  wars: number;
  raids: number;
  territories: number;
}

async function fetchGuildProfile(): Promise<GuildProfile | null> {
  try {
    const res = await fetch(GUILD_PROFILE_URL, {
      headers: FETCH_HEADERS,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      level: Number(data.level) || 0,
      wars: Number(data.wars) || 0,
      raids: Number(data.raids) || 0,
      territories: Number(data.territories) || 0,
    };
  } catch (error) {
    console.error('public-stats: failed to fetch guild profile:', error);
    return null;
  }
}

// TAq's rank (1-indexed) on a given Wynncraft leaderboard, or null if unavailable.
async function fetchLeaderboardPlacement(type: string): Promise<number | null> {
  try {
    const res = await fetch(`${LEADERBOARD_BASE_URL}/${type}`, {
      headers: FETCH_HEADERS,
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    for (const [rank, entry] of Object.entries(data)) {
      if (entry && typeof entry === 'object' && (entry as any).prefix === GUILD_PREFIX) {
        const parsed = parseInt(rank, 10);
        return Number.isFinite(parsed) ? parsed : null;
      }
    }
    return null;
  } catch (error) {
    console.error(`public-stats: failed to fetch leaderboard "${type}":`, error);
    return null;
  }
}

async function fetchHqSnipesThisSeason(): Promise<{ season: number | null; count: number }> {
  try {
    const pool = getPool();
    const seasonResult = await pool.query(
      `SELECT value FROM snipe_settings WHERE key = 'current_season'`
    );
    const season = seasonResult.rows.length > 0 ? parseInt(seasonResult.rows[0].value, 10) : 1;

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM snipe_logs WHERE season = $1`,
      [season]
    );

    return { season, count: countResult.rows[0]?.cnt ?? 0 };
  } catch (error) {
    console.error('public-stats: failed to fetch HQ snipe count:', error);
    return { season: null, count: 0 };
  }
}

// In-process cache for the four external Wynncraft calls. `force-dynamic`
// (needed for per-request rate limiting) disables Next's data cache defaults,
// so without this every landing-page visit paid 4 live Wynncraft round-trips.
const WYNN_STATS_TTL_MS = 5 * 60 * 1000;
let wynnStatsCache: {
  expires: number;
  data: [GuildProfile | null, number | null, number | null, number | null];
} | null = null;

async function fetchWynnStats() {
  if (wynnStatsCache && wynnStatsCache.expires > Date.now()) {
    return wynnStatsCache.data;
  }
  const data = await Promise.all([
    fetchGuildProfile(),
    fetchLeaderboardPlacement('guildWars'),
    fetchLeaderboardPlacement('guildTotalRaids'),
    fetchLeaderboardPlacement('guildLevel'),
  ] as const);
  // Only cache fully-successful results so transient API failures retry
  if (data.every(d => d !== null)) {
    wynnStatsCache = { expires: Date.now() + WYNN_STATS_TTL_MS, data };
  }
  return data;
}

export async function GET(request: NextRequest) {
  const rateLimitCheck = checkRateLimit(request, 'public-stats');
  if (!rateLimitCheck.allowed) {
    return createRateLimitResponse(rateLimitCheck.resetTime);
  }
  incrementRateLimit(request, 'public-stats');

  const [[profile, warsPlacement, raidsPlacement, levelPlacement], hqSnipes] = await Promise.all([
    fetchWynnStats(),
    fetchHqSnipesThisSeason(),
  ]);

  const response = NextResponse.json(
    {
      guild: {
        level: profile?.level ?? null,
        levelPlacement,
        wars: profile?.wars ?? null,
        warsPlacement,
        raids: profile?.raids ?? null,
        raidsPlacement,
        territories: profile?.territories ?? null,
      },
      hqSnipes,
    },
    {
      headers: { 'Cache-Control': 'public, max-age=120, s-maxage=300' },
    }
  );

  return addRateLimitHeaders(response, rateLimitCheck.remainingRequests, rateLimitCheck.resetTime);
}
