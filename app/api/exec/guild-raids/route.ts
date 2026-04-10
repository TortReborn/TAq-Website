import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { LIST_ORDER_SQL, RAID_SHORT_TO_FULL } from '@/lib/graid-log-constants';

export const dynamic = 'force-dynamic';

function isTestMode(): boolean {
  const v = process.env.TEST_MODE;
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getBotToken(): string | undefined {
  return isTestMode() ? process.env.TEST_DISCORD_BOT_TOKEN : process.env.DISCORD_BOT_TOKEN;
}

function getRaidLogChannelId(): string | undefined {
  return isTestMode() ? process.env.TEST_RAID_LOG_CHANNEL_ID : process.env.RAID_LOG_CHANNEL_ID;
}

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

// POST — Manually log a guild raid (group of 4) or an individual completion
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const { raidType, participants, mode } = await request.json();

    // Validate participants
    if (!participants || !Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json({ error: 'Participants are required.' }, { status: 400 });
    }
    for (const p of participants) {
      if (!p || typeof p !== 'string' || !p.trim()) {
        return NextResponse.json({ error: 'All participants must have a valid IGN.' }, { status: 400 });
      }
    }

    // Determine mode: explicit or inferred from participant count
    const inferredMode: 'group' | 'individual' = mode === 'individual' || participants.length === 1 ? 'individual' : 'group';

    if (inferredMode === 'group') {
      if (participants.length !== 4) {
        return NextResponse.json({ error: 'Exactly 4 participants are required for a group raid.' }, { status: 400 });
      }
      const uniqueIgns = new Set(participants.map((p: string) => p.trim().toLowerCase()));
      if (uniqueIgns.size < 4) {
        return NextResponse.json({ error: 'All 4 participants must be different players.' }, { status: 400 });
      }
    } else {
      if (participants.length !== 1) {
        return NextResponse.json({ error: 'Individual logs must have exactly 1 participant.' }, { status: 400 });
      }
    }

    // Validate raid type — required for group, optional (Unknown allowed) for individual
    let fullRaidName: string | null = null;
    const rawType = (raidType ?? '').toString().trim();
    if (rawType && rawType !== 'Unknown') {
      const resolved = RAID_SHORT_TO_FULL[rawType];
      if (!resolved) {
        return NextResponse.json({ error: 'Invalid raid type. Must be NOTG, TCC, TNA, NOL, TWP, or Unknown.' }, { status: 400 });
      }
      fullRaidName = resolved;
    } else if (inferredMode === 'group') {
      return NextResponse.json({ error: 'Raid type is required for group raids.' }, { status: 400 });
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

    if (guildMembers.size > 0) {
      const nonMembers = participants.filter((p: string) => !guildMembers.has(p.trim().toLowerCase()));
      if (nonMembers.length > 0) {
        return NextResponse.json({ error: `Not current guild members: ${nonMembers.join(', ')}` }, { status: 400 });
      }
    }

    // Check for active event
    const eventResult = await pool.query(`SELECT id FROM graid_events WHERE active = TRUE LIMIT 1`);
    const eventId = eventResult.rows.length > 0 ? eventResult.rows[0].id : null;

    // Insert log
    const logResult = await pool.query(
      `INSERT INTO graid_logs (event_id, raid_type) VALUES ($1, $2) RETURNING id`,
      [eventId, fullRaidName]
    );
    const logId = logResult.rows[0].id;

    // Insert participants
    for (const ign of participants) {
      const trimmed = ign.trim();
      const uuidResult = await pool.query(`SELECT uuid FROM discord_links WHERE LOWER(ign) = LOWER($1)`, [trimmed]);
      const uuid = uuidResult.rows.length > 0 ? uuidResult.rows[0].uuid : null;
      await pool.query(
        `INSERT INTO graid_log_participants (log_id, uuid, ign) VALUES ($1, $2, $3)`,
        [logId, uuid, trimmed]
      );

      // Upsert event totals if active event
      if (eventId && uuid) {
        await pool.query(`
          INSERT INTO graid_event_totals (event_id, uuid, total)
          VALUES ($1, $2, 1)
          ON CONFLICT (event_id, uuid) DO UPDATE
            SET total = graid_event_totals.total + 1, last_updated = NOW()
        `, [eventId, uuid]);
      }
    }

    // Post to Discord raid-log channel — only for group raids with a known type
    const botToken = getBotToken();
    const channelId = getRaidLogChannelId();
    let discordWarning: string | undefined;

    if (inferredMode === 'group' && fullRaidName && botToken && channelId) {
      try {
        const bolded = participants.map((p: string) => `**${p.trim()}**`);
        const namesStr = bolded.slice(0, -1).join(', ') + ', and ' + bolded[bolded.length - 1];
        const embed = {
          title: `${fullRaidName} Completed!`,
          description: namesStr,
          color: 0x00FF00,
        };
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bot ${botToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ embeds: [embed] }),
        });
        if (!res.ok) {
          const errBody = await res.text();
          console.error('Discord post failed:', res.status, errBody);
          discordWarning = `Raid logged but failed to post to Discord: ${res.status}`;
        }
      } catch (discordErr) {
        console.error('Discord post error:', discordErr);
        discordWarning = 'Raid logged but failed to post to Discord channel';
      }
    }

    // Audit log
    const typeLabel = fullRaidName ?? 'Unknown';
    const actionDesc = inferredMode === 'individual'
      ? `Logged individual raid #${logId}: ${typeLabel} for ${participants[0]}`
      : `Logged guild raid #${logId}: ${typeLabel} with ${participants.join(', ')}`;
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action)
       VALUES ('graid', $1, $2, $3)`,
      [session.ign, session.discord_id, actionDesc]
    );

    return NextResponse.json({ success: true, id: logId, mode: inferredMode, warning: discordWarning });
  } catch (error) {
    console.error('Guild raid log error:', error);
    return NextResponse.json({ error: 'Failed to log guild raid' }, { status: 500 });
  }
}
