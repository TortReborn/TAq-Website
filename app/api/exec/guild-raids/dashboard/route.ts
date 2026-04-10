import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { getRaidShort } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const isDateFiltered = !!(dateFrom || dateTo);

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;
    if (dateFrom) {
      conditions.push(`gl.completed_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gl.completed_at <= $${paramIdx++}`);
      params.push(dateTo);
    }
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total raids
    const totalResult = await pool.query(
      `SELECT COUNT(*) as cnt FROM graid_logs gl ${whereClause}`, params
    );
    let totalRaids = parseInt(totalResult.rows[0].cnt, 10);

    // Add total offset when not date-filtered
    if (!isDateFiltered) {
      const offsetSum = await pool.query(`SELECT COALESCE(SUM(raid_offset), 0) as s FROM graid_raid_offsets`);
      totalRaids += parseInt(offsetSum.rows[0].s, 10);
    }

    // Unique participants (by UUID)
    const partResult = await pool.query(
      `SELECT COUNT(DISTINCT glp.uuid) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       ${whereClause}`,
      params
    );
    const uniqueParticipants = parseInt(partResult.rows[0].cnt, 10);

    // Most active player (UUID-first)
    const topPlayerResult = await pool.query(
      `SELECT COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid, COUNT(*) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       ${whereClause}
       GROUP BY glp.uuid, COALESCE(dl.ign, glp.ign) ORDER BY cnt DESC LIMIT 1`,
      params
    );
    let mostActivePlayer = topPlayerResult.rows.length > 0
      ? { ign: topPlayerResult.rows[0].display_name, count: parseInt(topPlayerResult.rows[0].cnt, 10) }
      : null;

    // Raid type distribution
    const typeResult = await pool.query(
      `SELECT gl.raid_type, COUNT(*) as cnt
       FROM graid_logs gl ${whereClause}
       GROUP BY gl.raid_type ORDER BY cnt DESC`,
      params
    );
    const raidTypeDistribution = typeResult.rows.map((r: any) => ({
      type: getRaidShort(r.raid_type),
      fullName: r.raid_type,
      count: parseInt(r.cnt, 10),
    }));

    // Raids over time (per week, broken down by raid type)
    const timeResult = await pool.query(
      `SELECT DATE_TRUNC('week', gl.completed_at) as week, gl.raid_type, COUNT(*) as cnt
       FROM graid_logs gl ${whereClause}
       GROUP BY week, gl.raid_type ORDER BY week`,
      params
    );
    const weekMap = new Map<string, { week: string; total: number; types: Record<string, number> }>();
    for (const r of timeResult.rows) {
      const week = new Date(r.week).toISOString().slice(0, 10);
      const short = getRaidShort(r.raid_type);
      const cnt = parseInt(r.cnt, 10);
      let entry = weekMap.get(week);
      if (!entry) {
        entry = { week, total: 0, types: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, TWP: 0, Unknown: 0 } };
        weekMap.set(week, entry);
      }
      entry.total += cnt;
      entry.types[short] = (entry.types[short] || 0) + cnt;
    }
    const raidsOverTime = Array.from(weekMap.values()).sort((a, b) => a.week.localeCompare(b.week));

    // Top 10 players, broken down by raid type
    const topPlayersResult = await pool.query(
      `SELECT COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid, gl.raid_type, COUNT(*) as cnt
       FROM graid_log_participants glp
       JOIN graid_logs gl ON glp.log_id = gl.id
       LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
       ${whereClause}
       GROUP BY glp.uuid, COALESCE(dl.ign, glp.ign), gl.raid_type`,
      params
    );
    const playerMap = new Map<string, { ign: string; count: number; types: Record<string, number> }>();
    for (const r of topPlayersResult.rows) {
      const key = r.uuid || r.display_name;
      const cnt = parseInt(r.cnt, 10);
      const short = getRaidShort(r.raid_type);
      let entry = playerMap.get(key);
      if (!entry) {
        entry = { ign: r.display_name, count: 0, types: { NOTG: 0, TCC: 0, TNA: 0, NOL: 0, TWP: 0, Unknown: 0 } };
        playerMap.set(key, entry);
      }
      entry.count += cnt;
      entry.types[short] = (entry.types[short] || 0) + cnt;
    }
    const topPlayers = Array.from(playerMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Guild raid events (for the event bar/drilldown)
    // Limit to events that overlap the date range, if filtered.
    const eventConditions: string[] = [];
    const eventParams: any[] = [];
    let evtIdx = 1;
    if (dateFrom) {
      eventConditions.push(`(end_ts IS NULL OR end_ts >= $${evtIdx++})`);
      eventParams.push(dateFrom);
    }
    if (dateTo) {
      eventConditions.push(`start_ts <= $${evtIdx++}`);
      eventParams.push(dateTo);
    }
    const eventWhere = eventConditions.length > 0 ? `WHERE ${eventConditions.join(' AND ')}` : '';
    const eventsResult = await pool.query(
      `SELECT ge.id, ge.title, ge.start_ts, ge.end_ts, ge.active,
              (SELECT COUNT(*) FROM graid_logs gl2 WHERE gl2.event_id = ge.id) AS total_raids
       FROM graid_events ge
       ${eventWhere}
       ORDER BY ge.start_ts DESC`,
      eventParams
    );
    const events = eventsResult.rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      startTs: r.start_ts,
      endTs: r.end_ts,
      active: r.active,
      totalRaids: parseInt(r.total_raids, 10),
    }));

    return NextResponse.json({
      data: {
        totalRaids,
        uniqueParticipants,
        mostActivePlayer,
        raidTypeDistribution,
        raidsOverTime,
        topPlayers,
        events,
      },
    });
  } catch (error) {
    console.error('Graid log dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
