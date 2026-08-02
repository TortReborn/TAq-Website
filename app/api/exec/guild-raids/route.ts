import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { LIST_ORDER_SQL } from '@/lib/graid-log-constants';
import {
  validateGraidLogBatch,
  validateGraidLogSubmission,
  validateGraidRaidType,
} from '@/lib/graid-log-validation';

export const dynamic = 'force-dynamic';

// GET — List graid logs with filtering and pagination
export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const url = new URL(request.url);

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') || '25', 10)));
    const raidType = url.searchParams.get('raidType');
    const ign = url.searchParams.get('ign');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') || 'Newest';

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    if (raidType) {
      if (raidType === 'Unknown') {
        conditions.push(`gl.raid_type IS NULL`);
      } else {
        conditions.push(`gl.raid_type = $${paramIdx++}`);
        params.push(raidType);
      }
    }
    if (dateFrom) {
      conditions.push(`gl.completed_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`gl.completed_at <= $${paramIdx++}`);
      params.push(dateTo);
    }
    if (ign) {
      // Resolve IGN → UUID first for accurate filtering across name changes
      const uuidLookup = await pool.query(
        `SELECT uuid FROM discord_links WHERE LOWER(ign) = LOWER($1) AND uuid IS NOT NULL`, [ign]
      );
      if (uuidLookup.rows.length > 0) {
        conditions.push(`gl.id IN (SELECT log_id FROM graid_log_participants WHERE uuid = $${paramIdx++})`);
        params.push(uuidLookup.rows[0].uuid);
      } else {
        conditions.push(`gl.id IN (SELECT log_id FROM graid_log_participants WHERE LOWER(ign) = LOWER($${paramIdx++}))`);
        params.push(ign);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = LIST_ORDER_SQL[sort] || LIST_ORDER_SQL['Newest'];

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM graid_logs gl ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const offset = (page - 1) * perPage;
    const logsResult = await pool.query(
      `SELECT gl.id, gl.raid_type, gl.completed_at
       FROM graid_logs gl
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, perPage, offset]
    );

    const logIds = logsResult.rows.map((r: any) => r.id);
    let participantsByLog: Record<number, { ign: string; uuid: string | null }[]> = {};

    if (logIds.length > 0) {
      const placeholders = logIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const partResult = await pool.query(
        `SELECT glp.log_id, COALESCE(dl.ign, glp.ign) AS display_name, glp.uuid
         FROM graid_log_participants glp
         LEFT JOIN discord_links dl ON glp.uuid = dl.uuid
         WHERE glp.log_id IN (${placeholders})
         ORDER BY display_name`,
        logIds
      );
      for (const row of partResult.rows) {
        if (!participantsByLog[row.log_id]) participantsByLog[row.log_id] = [];
        participantsByLog[row.log_id].push({ ign: row.display_name, uuid: row.uuid });
      }
    }

    const logs = logsResult.rows.map((r: any) => ({
      id: r.id,
      raidType: r.raid_type,
      completedAt: r.completed_at,
      participants: participantsByLog[r.id] || [],
    }));

    return NextResponse.json({ logs, total, page, perPage });
  } catch (error) {
    console.error('Graid log list error:', error);
    return NextResponse.json({ error: 'Failed to fetch graid logs' }, { status: 500 });
  }
}

// POST — Queue a manually-logged guild raid for the bot to process.
// We do NOT write to graid_logs / graid_event_totals / uncollected_raids here —
// that all happens in the bot's update_member_data loop when it drains
// graid_log_queue. This way the manual-log path runs through the same code
// as auto-detected raids (including the guild level progress image embed).
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const body = await request.json();

    // Normalize to a list of raids. The form submits { raids: [...] } — each
    // raid has 1-4 participants (cross-guild parties only log our own members)
    // and an optional type (Unknown = recorded but not posted to Discord).
    // The legacy single-raid shape { raidType, participants, mode } is still
    // accepted. See lib/graid-log-validation.
    let entries: { fullRaidName: string | null; participants: string[]; mode: 'group' | 'individual' }[];
    if (Array.isArray(body?.raids)) {
      const batch = validateGraidLogBatch(body.raids);
      if (!batch.ok) {
        return NextResponse.json({ error: batch.error }, { status: 400 });
      }
      // The queue's mode column doubles as the announce flag: the bot only
      // posts to Discord for mode 'group' with a known raid type.
      entries = batch.raids.map(r => ({
        fullRaidName: r.raidType,
        participants: r.participants,
        mode: (r.announce && r.raidType ? 'group' : 'individual') as 'group' | 'individual',
      }));
    } else {
      const validation = validateGraidLogSubmission(body?.participants, body?.mode);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      const typeResult = validateGraidRaidType(body?.raidType);
      if (!typeResult.ok) {
        return NextResponse.json({ error: typeResult.error }, { status: 400 });
      }
      entries = [{
        fullRaidName: typeResult.fullRaidName,
        participants: validation.participants,
        mode: validation.mode,
      }];
    }

    // Validate participants are guild members
    const cacheResult = await pool.query(`SELECT data FROM cache_entries WHERE cache_key = 'guildData'`);
    let guildMembers: Set<string> = new Set();
    if (cacheResult.rows.length > 0) {
      const members = cacheResult.rows[0].data?.members;
      if (Array.isArray(members)) {
        for (const m of members) {
          const name = m.name || m.username;
          if (name) guildMembers.add(name.toLowerCase());
        }
      }
    }

    // Distinct IGNs across all raids (lowercased key → display form)
    const distinctIgns = new Map<string, string>();
    for (const entry of entries) {
      for (const ign of entry.participants) {
        if (!distinctIgns.has(ign.toLowerCase())) distinctIgns.set(ign.toLowerCase(), ign);
      }
    }

    if (guildMembers.size > 0) {
      const nonMembers = [...distinctIgns.values()].filter(p => !guildMembers.has(p.toLowerCase()));
      if (nonMembers.length > 0) {
        return NextResponse.json({ error: `Not current guild members: ${nonMembers.join(', ')}` }, { status: 400 });
      }
    }

    // Resolve UUIDs from IGNs (once per distinct player) so the queue carries
    // everything the bot needs and we don't have to hit discord_links again
    // at processing time.
    const uuidByIgn = new Map<string, string | null>();
    for (const [key, ign] of distinctIgns) {
      const uuidResult = await pool.query(
        `SELECT uuid FROM discord_links WHERE LOWER(ign) = LOWER($1)`, [ign]
      );
      uuidByIgn.set(key, uuidResult.rows.length > 0 ? uuidResult.rows[0].uuid : null);
    }

    // Insert all raids into the queue atomically — a failed batch queues
    // nothing. The bot's update_member_data loop will pick these up on its
    // next tick (~3 minutes) and run them through the same flow as
    // auto-detected raids.
    const queueIds: number[] = [];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        const resolvedParticipants = entry.participants.map(ign => ({
          uuid: uuidByIgn.get(ign.toLowerCase()) ?? null,
          ign,
        }));
        const queueResult = await client.query(
          `INSERT INTO graid_log_queue (raid_type, mode, participants, submitted_by, submitted_by_ign)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [entry.fullRaidName, entry.mode, JSON.stringify(resolvedParticipants), session.discord_id, session.ign]
        );
        const queueId = queueResult.rows[0].id;
        queueIds.push(queueId);

        const typeLabel = entry.fullRaidName ?? 'Unknown';
        const actionDesc = `Queued ${entry.mode === 'group' ? 'guild raid' : 'silent guild raid'} (queue #${queueId}): ${typeLabel} with ${entry.participants.join(', ')}`;
        await client.query(
          `INSERT INTO audit_log (log_type, actor_name, actor_id, action)
           VALUES ('graid', $1, $2, $3)`,
          [session.ign, session.discord_id, actionDesc]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return NextResponse.json({
      success: true,
      id: queueIds[0],
      ids: queueIds,
      count: queueIds.length,
      mode: entries[0].mode,
      status: 'pending',
      warning: 'Queued for the bot — will appear in Discord on the next bot tick (within ~3 minutes).',
    });
  } catch (error) {
    console.error('Guild raid queue error:', error);
    return NextResponse.json({ error: 'Failed to queue guild raid' }, { status: 500 });
  }
}
