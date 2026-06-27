import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RAID_NAMES } from '@/lib/graid';

export const dynamic = 'force-dynamic';

function isNonNegativeInt(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isPositiveInt(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0;
}

function parsePointConfig(updates: any) {
  const hasConfig =
    updates.minPoints !== undefined ||
    updates.lePerPoint !== undefined ||
    updates.raidPoints !== undefined ||
    updates.milestones !== undefined ||
    updates.placementBonuses !== undefined;

  if (!hasConfig) return { hasConfig: false as const };

  const minPoints = Number(updates.minPoints);
  const lePerPoint = Number(updates.lePerPoint);
  const raidPoints = updates.raidPoints && typeof updates.raidPoints === 'object' ? updates.raidPoints : {};
  const milestones = Array.isArray(updates.milestones) ? updates.milestones : [];
  const placementBonuses = Array.isArray(updates.placementBonuses) ? updates.placementBonuses : [];

  if (!isNonNegativeInt(minPoints)) {
    return { error: 'Minimum points must be a non-negative integer' };
  }
  if (!isPositiveInt(lePerPoint)) {
    return { error: 'LE per point must be a positive integer' };
  }

  const normalizedRaidPoints: Record<string, number> = {};
  for (const raidName of RAID_NAMES) {
    const points = Number(raidPoints[raidName]);
    if (!isNonNegativeInt(points)) {
      return { error: `Points for ${raidName} must be a non-negative integer` };
    }
    normalizedRaidPoints[raidName] = points;
  }

  const milestoneKeys = new Set<number>();
  const normalizedMilestones: { threshold: number; points: number }[] = [];
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
  const normalizedPlacements: { placement: number; points: number }[] = [];
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
    hasConfig: true as const,
    value: {
      minPoints,
      lePerPoint,
      raidPoints: normalizedRaidPoints,
      milestones: normalizedMilestones,
      placementBonuses: normalizedPlacements,
    },
  };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (isNaN(eventId)) {
    return NextResponse.json({ error: 'Invalid event ID' }, { status: 400 });
  }

  const updates = await request.json();
  const parsedConfig = parsePointConfig(updates);
  if ('error' in parsedConfig) {
    return NextResponse.json({ error: parsedConfig.error }, { status: 400 });
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.title !== undefined) {
      const title = typeof updates.title === 'string' ? updates.title.trim() : '';
      if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
      setClauses.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (updates.endDate !== undefined) {
      setClauses.push(`end_ts = $${paramIndex++}`);
      values.push(updates.endDate || null);
    }
    if (updates.active !== undefined) {
      setClauses.push(`active = $${paramIndex++}`);
      values.push(!!updates.active);
      if (updates.active === false) {
        setClauses.push(`end_ts = NOW()`);
      }
    }
    if (parsedConfig.hasConfig) {
      setClauses.push(`min_points = $${paramIndex++}`);
      values.push(parsedConfig.value.minPoints);
      setClauses.push(`le_per_point = $${paramIndex++}`);
      values.push(parsedConfig.value.lePerPoint);
      setClauses.push(`low_rank_reward = 0`);
      setClauses.push(`high_rank_reward = 0`);
      setClauses.push(`min_completions = 0`);
      setClauses.push(`bonus_threshold = NULL`);
      setClauses.push(`bonus_amount = NULL`);
    }

    if (setClauses.length === 0 && !parsedConfig.hasConfig) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    await client.query('BEGIN');
    if (setClauses.length > 0) {
      values.push(eventId);
      await client.query(
        `UPDATE graid_events SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    if (parsedConfig.hasConfig) {
      await client.query(`DELETE FROM graid_event_raid_points WHERE event_id = $1`, [eventId]);
      await client.query(`DELETE FROM graid_event_milestones WHERE event_id = $1`, [eventId]);
      await client.query(`DELETE FROM graid_event_placement_bonuses WHERE event_id = $1`, [eventId]);

      for (const [raidType, points] of Object.entries(parsedConfig.value.raidPoints)) {
        await client.query(
          `INSERT INTO graid_event_raid_points (event_id, raid_type, points)
           VALUES ($1, $2, $3)`,
          [eventId, raidType, points]
        );
      }
      for (const milestone of parsedConfig.value.milestones) {
        await client.query(
          `INSERT INTO graid_event_milestones (event_id, threshold_points, bonus_points)
           VALUES ($1, $2, $3)`,
          [eventId, milestone.threshold, milestone.points]
        );
      }
      for (const placement of parsedConfig.value.placementBonuses) {
        await client.query(
          `INSERT INTO graid_event_placement_bonuses (event_id, placement, bonus_points)
           VALUES ($1, $2, $3)`,
          [eventId, placement.placement, placement.points]
        );
      }
    }

    await client.query('COMMIT');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (error?.code === '23505') {
      return NextResponse.json({ error: 'An event with that title already exists' }, { status: 409 });
    }
    console.error('Graid event update error:', error);
    return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
  } finally {
    client.release();
  }
}
