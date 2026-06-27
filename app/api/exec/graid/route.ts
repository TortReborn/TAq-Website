import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RAID_NAMES } from '@/lib/graid';

export const dynamic = 'force-dynamic';

type MilestoneInput = { threshold: number; points: number };
type PlacementInput = { placement: number; points: number };

function isNonNegativeInt(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInt(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function isNonNegativePointDecimal(value: unknown) {
  const text = String(value);
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 && /^\d+(\.\d{1,2})?$/.test(text);
}

function validateConfig(body: any) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const endDate = typeof body.endDate === 'string' ? body.endDate : '';
  const minPoints = Number(body.minPoints);
  const lePerPoint = Number(body.lePerPoint);
  const raidPoints = body.raidPoints && typeof body.raidPoints === 'object' ? body.raidPoints : {};
  const milestones = Array.isArray(body.milestones) ? body.milestones : [];
  const placementBonuses = Array.isArray(body.placementBonuses) ? body.placementBonuses : [];

  if (!title || !endDate) {
    return { error: 'Title and end date are required' };
  }
  if (!isNonNegativeInt(minPoints)) {
    return { error: 'Minimum points must be a non-negative integer' };
  }
  if (!isPositiveInt(lePerPoint)) {
    return { error: 'LE per point must be a positive integer' };
  }

  const normalizedRaidPoints: Record<string, number> = {};
  for (const raidName of RAID_NAMES) {
    const points = Number(raidPoints[raidName]);
    if (!isNonNegativePointDecimal(raidPoints[raidName])) {
      return { error: `Points for ${raidName} must be a non-negative decimal with at most 2 decimal places` };
    }
    normalizedRaidPoints[raidName] = points;
  }

  const milestoneKeys = new Set<number>();
  const normalizedMilestones: MilestoneInput[] = [];
  for (const item of milestones) {
    const threshold = Number(item.threshold);
    const points = Number(item.points);
    if (!isPositiveInt(threshold) || !isNonNegativeInt(points)) {
      return { error: 'Milestones must use positive thresholds and non-negative bonus points' };
    }
    if (milestoneKeys.has(threshold)) {
      return { error: `Duplicate milestone threshold: ${threshold}` };
    }
    milestoneKeys.add(threshold);
    normalizedMilestones.push({ threshold, points });
  }

  const placementKeys = new Set<number>();
  const normalizedPlacements: PlacementInput[] = [];
  for (const item of placementBonuses) {
    const placement = Number(item.placement);
    const points = Number(item.points);
    if (!isPositiveInt(placement) || !isNonNegativeInt(points)) {
      return { error: 'Placement bonuses must use positive placements and non-negative bonus points' };
    }
    if (placementKeys.has(placement)) {
      return { error: `Duplicate placement bonus: ${placement}` };
    }
    placementKeys.add(placement);
    normalizedPlacements.push({ placement, points });
  }

  return {
    value: {
      title,
      endDate,
      minPoints,
      lePerPoint,
      raidPoints: normalizedRaidPoints,
      milestones: normalizedMilestones,
      placementBonuses: normalizedPlacements,
    },
  };
}

async function attachConfig(pool: any, events: any[]) {
  if (events.length === 0) return [];
  const ids = events.map(event => event.id);
  const [raidRes, milestoneRes, placementRes] = await Promise.all([
    pool.query(`SELECT event_id, raid_type, points FROM graid_event_raid_points WHERE event_id = ANY($1::bigint[])`, [ids]),
    pool.query(`SELECT event_id, threshold_points, bonus_points FROM graid_event_milestones WHERE event_id = ANY($1::bigint[]) ORDER BY threshold_points ASC`, [ids]),
    pool.query(`SELECT event_id, placement, bonus_points FROM graid_event_placement_bonuses WHERE event_id = ANY($1::bigint[]) ORDER BY placement ASC`, [ids]),
  ]);

  const raidPointsByEvent = new Map<number, Record<string, number>>();
  const milestonesByEvent = new Map<number, MilestoneInput[]>();
  const placementsByEvent = new Map<number, PlacementInput[]>();
  const pointEventIds = new Set<number>();

  for (const event of events) {
    raidPointsByEvent.set(Number(event.id), Object.fromEntries(RAID_NAMES.map(name => [name, 0])));
    milestonesByEvent.set(Number(event.id), []);
    placementsByEvent.set(Number(event.id), []);
  }

  for (const row of raidRes.rows) {
    const eventId = Number(row.event_id);
    pointEventIds.add(eventId);
    raidPointsByEvent.get(eventId)![row.raid_type] = Number(row.points ?? 0);
  }
  for (const row of milestoneRes.rows) {
    milestonesByEvent.get(Number(row.event_id))?.push({
      threshold: Number(row.threshold_points),
      points: Number(row.bonus_points ?? 0),
    });
  }
  for (const row of placementRes.rows) {
    placementsByEvent.get(Number(row.event_id))?.push({
      placement: Number(row.placement),
      points: Number(row.bonus_points ?? 0),
    });
  }

  return events.map(row => ({
    id: row.id,
    title: row.title,
    startTs: row.start_ts,
    endTs: row.end_ts,
    active: row.active,
    rewardMode: pointEventIds.has(Number(row.id)) ? 'points' : 'legacy',
    minPoints: Number(row.min_points ?? 0),
    lePerPoint: Number(row.le_per_point ?? 1),
    raidPoints: raidPointsByEvent.get(Number(row.id)),
    milestones: milestonesByEvent.get(Number(row.id)),
    placementBonuses: placementsByEvent.get(Number(row.id)),
    low: Number(row.low_rank_reward ?? 0),
    high: Number(row.high_rank_reward ?? 0),
    minc: Number(row.min_points ?? 0) || Number(row.min_completions ?? 0),
    bonusThreshold: row.bonus_threshold != null ? Number(row.bonus_threshold) : null,
    bonusAmount: row.bonus_amount != null ? Number(row.bonus_amount) : null,
    createdAt: row.created_at,
  }));
}

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, title, start_ts, end_ts, active, min_points, le_per_point,
              low_rank_reward, high_rank_reward, min_completions, bonus_threshold, bonus_amount, created_at
       FROM graid_events
       ORDER BY active DESC, start_ts DESC`
    );

    return NextResponse.json({ events: await attachConfig(pool, result.rows) });
  } catch (error) {
    console.error('Graid events fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = validateConfig(await request.json());
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const activeCheck = await client.query(`SELECT id FROM graid_events WHERE active = TRUE LIMIT 1`);
    if (activeCheck.rowCount && activeCheck.rowCount > 0) {
      return NextResponse.json({ error: 'Another event is already active. End it first.' }, { status: 400 });
    }

    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO graid_events (
         title, start_ts, end_ts, low_rank_reward, high_rank_reward, min_completions,
         bonus_threshold, bonus_amount, min_points, le_per_point, created_by_discord, active
       )
       VALUES ($1, NOW(), $2, 0, 0, 0, NULL, NULL, $3, $4, $5, true)
       RETURNING id`,
      [parsed.value.title, parsed.value.endDate, parsed.value.minPoints, parsed.value.lePerPoint, session.discord_id]
    );

    const eventId = result.rows[0].id;
    for (const [raidType, points] of Object.entries(parsed.value.raidPoints)) {
      await client.query(
        `INSERT INTO graid_event_raid_points (event_id, raid_type, points)
         VALUES ($1, $2, $3)`,
        [eventId, raidType, points]
      );
    }
    for (const milestone of parsed.value.milestones) {
      await client.query(
        `INSERT INTO graid_event_milestones (event_id, threshold_points, bonus_points)
         VALUES ($1, $2, $3)`,
        [eventId, milestone.threshold, milestone.points]
      );
    }
    for (const placement of parsed.value.placementBonuses) {
      await client.query(
        `INSERT INTO graid_event_placement_bonuses (event_id, placement, bonus_points)
         VALUES ($1, $2, $3)`,
        [eventId, placement.placement, placement.points]
      );
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true, id: eventId });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'An event with that title already exists' }, { status: 409 });
    }
    console.error('Graid event create error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  } finally {
    client.release();
  }
}
