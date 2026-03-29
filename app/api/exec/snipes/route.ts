import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { normalizeHq, isDry, LIST_ORDER_SQL } from '@/lib/snipe-constants';

export const dynamic = 'force-dynamic';

// --- Discord channel posting helpers ---

function isTestMode(): boolean {
  const v = process.env.TEST_MODE;
  if (!v) return false;
  const s = v.toLowerCase().trim();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

function getBotToken(): string | undefined {
  return isTestMode() ? process.env.TEST_DISCORD_BOT_TOKEN : process.env.DISCORD_BOT_TOKEN;
}

function getSnipeLogChannelId(): string | undefined {
  return isTestMode() ? process.env.TEST_SNIPE_LOG_CHANNEL_ID : process.env.SNIPE_LOG_CHANNEL_ID;
}

function formatParticipantsLog(participants: { ign: string; role: string }[]): string {
  const roleOrder = ['Healer', 'Tank', 'DPS'];
  const grouped: Record<string, string[]> = {};
  for (const p of participants) {
    if (!grouped[p.role]) grouped[p.role] = [];
    grouped[p.role].push(p.ign);
  }
  const parts: string[] = [];
  for (const role of roleOrder) {
    if (grouped[role]?.length) {
      parts.push(`${grouped[role].join(' ')} ${role}`);
    }
  }
  return parts.join(' / ');
}

async function postToSnipeLogChannel(
  logText: string,
  imageBuffer: Buffer,
  imageFilename: string,
): Promise<void> {
  const botToken = getBotToken();
  const channelId = getSnipeLogChannelId();
  if (!botToken || !channelId) {
    throw new Error('Discord bot token or snipe log channel ID not configured');
  }

  const formData = new FormData();
  formData.append('content', logText);
  formData.append('files[0]', new Blob([imageBuffer]), imageFilename);

  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bot ${botToken}` },
    body: formData,
  });

  if (!res.ok) {
    const errBody = await res.text();
    console.error('Discord post failed:', res.status, errBody);
    throw new Error(`Failed to post to Discord channel: ${res.status} ${errBody}`);
  }
}

// GET — List snipes with filtering and pagination
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
    const season = url.searchParams.get('season'); // null = current, '0' = all
    const hq = url.searchParams.get('hq');
    const guildTag = url.searchParams.get('guildTag');
    const ign = url.searchParams.get('ign');
    const diffMin = url.searchParams.get('diffMin');
    const diffMax = url.searchParams.get('diffMax');
    const dateFrom = url.searchParams.get('dateFrom');
    const dateTo = url.searchParams.get('dateTo');
    const sort = url.searchParams.get('sort') || 'Newest';

    // Build WHERE clauses
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIdx = 1;

    // Season filter
    if (season === '0') {
      // all-time, no filter
    } else if (season) {
      conditions.push(`sl.season = $${paramIdx++}`);
      params.push(parseInt(season, 10));
    } else {
      // default: current season
      const seasonRes = await pool.query(`SELECT value FROM snipe_settings WHERE key = 'current_season'`);
      const currentSeason = seasonRes.rows.length > 0 ? parseInt(seasonRes.rows[0].value, 10) : 1;
      conditions.push(`sl.season = $${paramIdx++}`);
      params.push(currentSeason);
    }

    if (hq) {
      conditions.push(`LOWER(sl.hq) = LOWER($${paramIdx++})`);
      params.push(hq);
    }
    if (guildTag) {
      conditions.push(`UPPER(sl.guild_tag) = UPPER($${paramIdx++})`);
      params.push(guildTag);
    }
    if (diffMin) {
      conditions.push(`sl.difficulty >= $${paramIdx++}`);
      params.push(parseInt(diffMin, 10));
    }
    if (diffMax) {
      conditions.push(`sl.difficulty <= $${paramIdx++}`);
      params.push(parseInt(diffMax, 10));
    }
    if (dateFrom) {
      conditions.push(`sl.sniped_at >= $${paramIdx++}`);
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push(`sl.sniped_at <= $${paramIdx++}`);
      params.push(dateTo);
    }
    if (ign) {
      conditions.push(`sl.id IN (SELECT snipe_id FROM snipe_participants WHERE LOWER(ign) = LOWER($${paramIdx++}))`);
      params.push(ign);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = LIST_ORDER_SQL[sort] || LIST_ORDER_SQL['Newest'];

    // Count total
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM snipe_logs sl ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Fetch page
    const offset = (page - 1) * perPage;
    const logsResult = await pool.query(
      `SELECT sl.id, sl.hq, sl.difficulty, sl.sniped_at, sl.guild_tag, sl.conns, sl.logged_by, sl.season
       FROM snipe_logs sl
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...params, perPage, offset]
    );

    // Fetch participants for all returned snipes
    const snipeIds = logsResult.rows.map((r: any) => r.id);
    let participantsBySnipe: Record<number, { ign: string; role: string }[]> = {};

    if (snipeIds.length > 0) {
      const placeholders = snipeIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const partResult = await pool.query(
        `SELECT snipe_id, ign, role FROM snipe_participants WHERE snipe_id IN (${placeholders}) ORDER BY role, ign`,
        snipeIds
      );
      for (const row of partResult.rows) {
        if (!participantsBySnipe[row.snipe_id]) participantsBySnipe[row.snipe_id] = [];
        participantsBySnipe[row.snipe_id].push({ ign: row.ign, role: row.role });
      }
    }

    const logs = logsResult.rows.map((r: any) => ({
      id: r.id,
      hq: r.hq,
      difficulty: r.difficulty,
      snipedAt: r.sniped_at,
      guildTag: r.guild_tag,
      conns: r.conns,
      loggedBy: r.logged_by,
      season: r.season,
      participants: participantsBySnipe[r.id] || [],
    }));

    return NextResponse.json({ logs, total, page, perPage });
  } catch (error) {
    console.error('Snipe list error:', error);
    return NextResponse.json({ error: 'Failed to fetch snipe logs' }, { status: 500 });
  }
}

// POST — Create a new snipe log
export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();

    // Parse body — supports both JSON and multipart/form-data (when image is attached)
    const contentType = request.headers.get('content-type') || '';
    let body: any;
    let imageBuffer: Buffer | null = null;
    let imageFilename = 'screenshot.png';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const dataField = formData.get('data');
      if (!dataField || typeof dataField !== 'string') {
        return NextResponse.json({ error: 'Missing data field' }, { status: 400 });
      }
      body = JSON.parse(dataField);

      const imageFile = formData.get('image') as File | null;
      if (body.logToChannel) {
        if (!imageFile) {
          return NextResponse.json({ error: 'Image is required when posting to snipe log channel' }, { status: 400 });
        }
        const validTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!validTypes.includes(imageFile.type)) {
          return NextResponse.json({ error: 'Image must be PNG, JPEG, or WebP' }, { status: 400 });
        }
        if (imageFile.size > 8 * 1024 * 1024) {
          return NextResponse.json({ error: 'Image must be under 8MB' }, { status: 400 });
        }
        imageBuffer = Buffer.from(await imageFile.arrayBuffer());
        imageFilename = imageFile.name || 'screenshot.png';
      }
    } else {
      body = await request.json();
    }

    const { hq, difficulty, guildTag, conns, snipedAt, season, participants } = body;

    // Validate required fields
    if (!hq || difficulty == null || !guildTag || conns == null || !participants?.length) {
      return NextResponse.json({ error: 'Missing required fields: hq, difficulty, guildTag, conns, participants' }, { status: 400 });
    }

    const normalizedHq = normalizeHq(hq);
    if (!normalizedHq) {
      return NextResponse.json({ error: `Invalid HQ territory: "${hq}"` }, { status: 400 });
    }

    if (difficulty < 1) {
      return NextResponse.json({ error: 'Difficulty must be at least 1' }, { status: 400 });
    }

    if (conns < 0 || conns > 6) {
      return NextResponse.json({ error: 'Connections must be between 0 and 6' }, { status: 400 });
    }

    // Validate participants
    for (const p of participants) {
      if (!p.ign || !p.role) {
        return NextResponse.json({ error: 'Each participant must have ign and role' }, { status: 400 });
      }
      if (!['Tank', 'Healer', 'DPS'].includes(p.role)) {
        return NextResponse.json({ error: `Invalid role "${p.role}". Must be Tank, Healer, or DPS` }, { status: 400 });
      }
    }

    // Determine season
    let snipeSeason = season;
    if (!snipeSeason) {
      const seasonRes = await pool.query(`SELECT value FROM snipe_settings WHERE key = 'current_season'`);
      snipeSeason = seasonRes.rows.length > 0 ? parseInt(seasonRes.rows[0].value, 10) : 1;
    }

    // Insert snipe log
    const snipeResult = await pool.query(
      `INSERT INTO snipe_logs (hq, difficulty, sniped_at, guild_tag, conns, logged_by, season)
       VALUES ($1, $2, $3, UPPER($4), $5, $6, $7)
       RETURNING id`,
      [normalizedHq, difficulty, snipedAt || new Date().toISOString(), guildTag, conns, session.discord_id, snipeSeason]
    );
    const snipeId = snipeResult.rows[0].id;

    // Insert participants
    for (const p of participants) {
      await pool.query(
        `INSERT INTO snipe_participants (snipe_id, ign, role) VALUES ($1, $2, $3)`,
        [snipeId, p.ign, p.role]
      );
    }

    // Audit log
    await pool.query(
      `INSERT INTO audit_log (log_type, actor_name, actor_id, action)
       VALUES ('snipe', $1, $2, $3)`,
      [session.ign, session.discord_id, `Logged snipe #${snipeId}: ${normalizedHq} ${difficulty}k vs [${guildTag.toUpperCase()}] with ${participants.length} participants`]
    );

    // Post to Discord snipe log channel if requested
    if (body.logToChannel && imageBuffer) {
      try {
        const snipeDate = new Date(snipedAt || new Date().toISOString());
        const dateStr = `${String(snipeDate.getUTCDate()).padStart(2, '0')}/${String(snipeDate.getUTCMonth() + 1).padStart(2, '0')}/${String(snipeDate.getUTCFullYear()).slice(-2)}`;
        const dry = isDry(normalizedHq, conns);
        const diffLabel = dry ? 'Drysnipe' : `${conns} Conns`;
        const participantsStr = formatParticipantsLog(participants);

        let logText = `**Date:** ${dateStr}\n`
          + `**Participants:** ${participantsStr}\n`
          + `**Location:** ${normalizedHq} (${guildTag.toUpperCase()})\n`
          + `**Difficulty:** ${diffLabel} / ${difficulty}k\n`
          + `**Result:** Success`;

        if (body.notes) {
          logText += `\n**Notes:** ${body.notes}`;
        }

        await postToSnipeLogChannel(logText, imageBuffer, imageFilename);
      } catch (discordErr) {
        console.error('Failed to post to snipe log channel:', discordErr);
        const errMsg = discordErr instanceof Error ? discordErr.message : String(discordErr);
        return NextResponse.json({ success: true, id: snipeId, warning: `Snipe logged but failed to post to Discord channel: ${errMsg}` });
      }
    }

    return NextResponse.json({ success: true, id: snipeId });
  } catch (error) {
    console.error('Snipe create error:', error);
    return NextResponse.json({ error: 'Failed to create snipe log' }, { status: 500 });
  }
}
