import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import {
  isMetric, isRange, isValidTimeZone,
  slotOccurrenceQuery, eventHeatmapQuery, presenceHeatmapQuery, presenceOccurrenceQuery,
  buildHeatmapGrid, bestWindow, unitFor,
  isSnapshotMetric, scopeFromParams,
} from '@/lib/activity-trends';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exec/activity/heatmap
 *   ?metric=presence|captures|raids|snipes
 *   &range=7d|30d|90d|1y|all
 *   &tz=IANA zone (default UTC)
 *   &uuid=<member>  (presence only)
 *
 * Returns a dense 7x24 grid in the requested zone. playtime is not offered:
 * it is snapshot-derived and has no hour-of-day to place on the grid.
 */
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const metric = params.get('metric') ?? 'presence';
  const range = params.get('range') ?? '30d';
  const tz = params.get('tz') ?? 'UTC';
  const uuid = params.get('uuid') ?? undefined;
  const cohort = params.get('cohort') ?? undefined;
  const scope = scopeFromParams(uuid, cohort);

  if (!isMetric(metric)) return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 });

  // The daily snapshot has no hour-of-day, and the cumulative counters cannot
  // supply one either: Wynncraft flushes them in bursts, so their hourly
  // deltas record when the server wrote, not when the playing happened.
  // Refusing is better than serving a grid that looks authoritative.
  if (isSnapshotMetric(metric)) {
    return NextResponse.json({
      error: `${metric} has no reliable hour-of-day. Use metric=presence for players online, `
           + `raids for raid timing, or captures for war timing.`,
    }, { status: 400 });
  }
  if (!isRange(range)) return NextResponse.json({ error: `Unknown range: ${range}` }, { status: 400 });
  if (!isValidTimeZone(tz)) return NextResponse.json({ error: `Unknown timezone: ${tz}` }, { status: 400 });
  if (uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return NextResponse.json({ error: 'Malformed uuid' }, { status: 400 });
  }
  if (scope && metric !== 'presence') {
    return NextResponse.json({ error: `metric=${metric} is guild-wide and cannot be filtered by uuid` }, { status: 400 });
  }

  // Snapshot metrics were rejected above, so only these two remain.
  const totalsQuery = metric === 'presence'
    ? presenceHeatmapQuery(range, tz, scope)
    : eventHeatmapQuery(metric, range, tz);
  // Presence divides by hours it actually sampled; events divide by the
  // calendar, where an empty slot really does mean nothing happened.
  const occQuery = metric === 'presence'
    ? presenceOccurrenceQuery(range, tz)
    : slotOccurrenceQuery(range, tz, metric);

  try {
    const pool = getPool();
    const [totals, occurrences] = await Promise.all([
      pool.query(totalsQuery.text, totalsQuery.values),
      pool.query(occQuery.text, occQuery.values),
    ]);

    const cells = buildHeatmapGrid(totals.rows as any, occurrences.rows as any);
    const peak = cells.reduce((a, b) => (b.average > a.average ? b : a), cells[0]);

    return NextResponse.json({
      metric,
      range,
      tz,
      unit: unitFor(metric, scope),
      cells,
      max: cells.reduce((m, c) => Math.max(m, c.average), 0),
      total: cells.reduce((s, c) => s + c.total, 0),
      peak: { dow: peak.dow, hour: peak.hour, average: peak.average },
      bestWindows: {
        two: bestWindow(cells, 2),
        four: bestWindow(cells, 4),
      },
    });
  } catch (error) {
    console.error('activity heatmap query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
