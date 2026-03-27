import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { ALL_TERRITORY_NAMES, TERRITORY_ROUTE_COUNTS } from '@/lib/snipe-constants';

export const dynamic = 'force-dynamic';

// PATCH — Update current season
export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { season } = await request.json();
    if (typeof season !== 'number' || season < 1 || !Number.isInteger(season)) {
      return NextResponse.json({ error: 'Invalid season number' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `INSERT INTO snipe_settings (key, value) VALUES ('current_season', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [String(season)]
    );

    return NextResponse.json({ success: true, season });
  } catch (error) {
    console.error('Season update error:', error);
    return NextResponse.json({ error: 'Failed to update season' }, { status: 500 });
  }
}

// GET — Territory list, current season, distinct IGN list, territory route counts
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    const [seasonResult, ignResult, snipedHqResult, seasonsResult, guildDataResult] = await Promise.all([
      pool.query(`SELECT value FROM snipe_settings WHERE key = 'current_season'`),
      pool.query(`SELECT DISTINCT ign FROM snipe_participants ORDER BY ign`),
      pool.query(`SELECT DISTINCT hq FROM snipe_logs`),
      pool.query(`SELECT DISTINCT season FROM snipe_logs ORDER BY season`),
      pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'guildData'`),
    ]);

    const currentSeason = seasonResult.rows.length > 0
      ? parseInt(seasonResult.rows[0].value, 10)
      : 1;

    const igns = ignResult.rows.map((r: any) => r.ign);
    const snipedHqs = snipedHqResult.rows.map((r: any) => r.hq);
    const seasonsWithData = seasonsResult.rows.map((r: any) => r.season as number);

    // Extract guild member IGNs from cached guild data
    let guildMembers: string[] = [];
    if (guildDataResult.rows.length > 0) {
      const guildData = guildDataResult.rows[0].data;
      const members = guildData?.members;
      if (Array.isArray(members)) {
        guildMembers = members.map((m: any) => m.name as string).filter(Boolean).sort();
      }
    }

    return NextResponse.json({
      territories: ALL_TERRITORY_NAMES,
      routeCounts: TERRITORY_ROUTE_COUNTS,
      currentSeason,
      igns,
      snipedHqs,
      seasonsWithData,
      guildMembers,
    });
  } catch (error) {
    console.error('Snipe meta fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch snipe metadata' }, { status: 500 });
  }
}
