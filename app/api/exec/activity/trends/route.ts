import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import {
  isMetric, isRange, isValidTimeZone, bucketFor, isSnapshotMetric,
  snapshotQuery, presenceQuery, eventQuery, latestPointQuery, headlineQuery, scopeFromParams,
  hourlyCounterQuery, usesHourlyCounters, hourlyCoverageQuery, presenceCoverageQuery,
  SNAPSHOT_COLUMNS, unitFor, isAveragedMetric, PARTICIPATION_WEIGHTED,
  type TrendPoint,
} from '@/lib/activity-trends';

export const dynamic = 'force-dynamic';

/**
 * GET /api/exec/activity/trends
 *   ?metric=playtime|presence|captures|raids|snipes
 *   &range=24h|7d|30d|90d|1y|all
 *   &tz=IANA zone (default UTC)
 *   &uuid=<member>   (playtime and presence only)
 */
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const metric = params.get('metric') ?? 'playtime';
  const range = params.get('range') ?? '30d';
  const tz = params.get('tz') ?? 'UTC';
  const uuid = params.get('uuid') ?? undefined;
  const cohort = params.get('cohort') ?? undefined;

  if (!isMetric(metric)) return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 400 });
  if (!isRange(range)) return NextResponse.json({ error: `Unknown range: ${range}` }, { status: 400 });
  if (!isValidTimeZone(tz)) return NextResponse.json({ error: `Unknown timezone: ${tz}` }, { status: 400 });
  if (uuid && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) {
    return NextResponse.json({ error: 'Malformed uuid' }, { status: 400 });
  }
  // Captures, guild raids and snipes are guild-level events with no member
  // attribution, so narrowing them to a person or a rank is meaningless.
  const scope = scopeFromParams(uuid, cohort);
  if (scope && !isSnapshotMetric(metric) && metric !== 'presence') {
    return NextResponse.json(
      { error: `metric=${metric} is guild-wide and cannot be narrowed to a member or rank` },
      { status: 400 },
    );
  }
  if (cohort && !scope) {
    return NextResponse.json({ error: `Unknown cohort: ${cohort}` }, { status: 400 });
  }

  const bucket = bucketFor(metric, range);

  try {
    const pool = getPool();

    // Hourly samples only describe time since they were deployed. Serving a
    // week from an hour of data yields a wall of empty buckets, so the source
    // is chosen from actual coverage and promotes itself as samples build up.
    let hourly = usesHourlyCounters(metric, range);
    if (hourly) {
      const cov = hourlyCoverageQuery(range);
      const { rows: covRows } = await pool.query(cov.text, cov.values);
      hourly = covRows[0]?.covered === true;
    }

    // Players online is one measure with two sources. Over a short window the
    // daily snapshot collapses to a single point — a 24-hour range is one day
    // wide — so presence serves it at hour grain whenever it reaches back far
    // enough, and the snapshot keeps the long ranges where only it has history.
    let usePresence = false;
    if (metric === 'playtime' && (range === '24h' || range === '7d')) {
      const cov = presenceCoverageQuery(range);
      const { rows: covRows } = await pool.query(cov.text, cov.values);
      usePresence = covRows[0]?.covered === true;
    }

    const bucketUsed = hourly || usePresence ? 'hour' : bucket;
    const effective = usePresence ? 'presence' : metric;
    const query =
      usePresence ? presenceQuery('hour', range, tz, scope)
      : hourly ? hourlyCounterQuery(SNAPSHOT_COLUMNS[metric]!, range, tz, scope)
      : isSnapshotMetric(metric) ? snapshotQuery(SNAPSHOT_COLUMNS[metric]!, bucket, range, scope)
      : metric === 'presence' ? presenceQuery(bucket, range, tz, scope)
      : eventQuery(metric, bucket, range, tz);
    const latestQ = latestPointQuery(effective);
    const headlineQ = headlineQuery(effective, range, scope, false, hourly)!;
    const prevQ = headlineQuery(effective, range, scope, true, hourly);

    const [{ rows }, latestRes, headlineRes, prevRes] = await Promise.all([
      pool.query(query.text, query.values),
      pool.query(latestQ.text, latestQ.values),
      pool.query(headlineQ.text, headlineQ.values),
      prevQ ? pool.query(prevQ.text, prevQ.values) : Promise.resolve(null),
    ]);
    const latest: Date | null = latestRes.rows[0]?.latest ?? null;
    const total = Number(headlineRes.rows[0]?.total ?? 0);
    const previousTotal: number | null =
      prevRes ? Number(prevRes.rows[0]?.total ?? 0) : null;

    const points: TrendPoint[] = rows.map((r) => ({
      t: r.t instanceof Date ? r.t.toISOString() : String(r.t),
      value: Number(r.value),
      ...(r.coverage !== undefined ? { coverage: r.coverage === null ? 0 : Number(r.coverage) } : {}),
      ...(r.approximate !== undefined ? { approximate: Number(r.approximate) } : {}),
      ...(r.attributed !== undefined ? { attributed: r.attributed === null ? 1 : Number(r.attributed) } : {}),
      // The underlying figure is still worth showing on hover: for an average
      // it is the hours behind it, for a participation-weighted count it is the
      // number of events, which makes the average party size recoverable.
      ...((isAveragedMetric(metric, scope) || PARTICIPATION_WEIGHTED[metric]) && r.raw_total !== undefined
        ? { rawTotal: Number(r.raw_total) } : {}),
    }));

    // Share of online members the per-member tables could name, over the whole
    // window. Below 1 means some members hide their online status; a per-member
    // presence series is missing them entirely, a guild-wide one is not.
    const attributedShare = points.length
      ? points.reduce((s, p) => s + (p.attributed ?? 1), 0) / points.length
      : 1;

    return NextResponse.json({
      metric,
      range,
      // The declared bucket must match what was actually served: falling back
      // to the daily table turns an 'hour' plan into 'day' buckets, and the
      // chart formats its axis from this.
      bucket: bucketUsed,
      // Daily-snapshot buckets have no time-of-day, so the requested zone was
      // not applied to them. The hourly counter samples do carry one.
      tz: isSnapshotMetric(metric) && !hourly && !usePresence ? 'UTC (daily snapshot)' : tz,
      source: usePresence ? 'presence-samples'
              : hourly ? 'hourly-samples'
              : isSnapshotMetric(metric) ? 'daily-snapshot'
              : 'events',
      unit: unitFor(metric, scope),
      averaged: isAveragedMetric(metric, scope),
      points,
      // Computed over the whole window, not summed from the buckets: for an
      // averaged metric those are different numbers and only this one is right.
      total,
      // Lets an all-zero chart distinguish "no activity" from "no data yet".
      latest: latest ? latest.toISOString() : null,
      // Same-length window immediately before this one; null for range=all.
      previousTotal,
      ...(metric === 'presence'
        ? { attributedShare, scope: scope ? 'attributed' : 'guild-total' }
        : {}),
    });
  } catch (error) {
    console.error('activity trends query failed', error);
    return NextResponse.json({ error: 'Query failed' }, { status: 500 });
  }
}
