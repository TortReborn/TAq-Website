import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import simpleDatabaseCache from '@/lib/db-cache-simple';
import { isValidFlagKey } from '@/lib/build-constants';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get guild data from cache (same approach as /api/members)
    const guildDataRaw = await simpleDatabaseCache.getGuildData();
    if (!guildDataRaw) {
      return NextResponse.json(
        { error: 'Guild member data not available.' },
        { status: 503 }
      );
    }

    // Parse guild members into a flat array
    let allMembers: { uuid: string; name: string; rank: string }[] = [];
    const guildData = guildDataRaw as any;

    if (guildData.members) {
      if (Array.isArray(guildData.members)) {
        allMembers = guildData.members.map((m: any) => ({
          uuid: m.uuid,
          name: m.name,
          rank: m.rank || '',
        }));
      } else if (typeof guildData.members === 'object') {
        Object.entries(guildData.members).forEach(([rank, rankGroup]) => {
          if (rank === 'total') return;
          Object.entries(rankGroup as any).forEach(([username, memberObj]) => {
            if (memberObj && typeof memberObj === 'object' && (memberObj as any).uuid) {
              allMembers.push({
                uuid: (memberObj as any).uuid,
                name: username,
                rank,
              });
            }
          });
        });
      }
    }

    const pool = getPool();
    const client = await pool.connect();

    try {
      // Fetch definitions, discord links, builds, and flags in parallel
      const [defsResult, discordLinksResult, buildsResult, flagsResult] = await Promise.all([
        client.query('SELECT key, name, role, color, conns_url, hq_url, sort_order FROM build_definitions ORDER BY sort_order'),
        client.query('SELECT uuid, rank, discord_id, ign FROM discord_links'),
        client.query('SELECT uuid, build_key, created_at FROM member_builds'),
        client.query('SELECT uuid, flag FROM member_war_flags'),
      ]);

      // Build definitions
      const buildDefinitions = defsResult.rows.map(row => ({
        key: row.key,
        name: row.name,
        role: row.role,
        color: row.color,
        connsUrl: row.conns_url,
        hqUrl: row.hq_url,
        sortOrder: row.sort_order,
      }));

      // Valid build keys from DB
      const validBuildKeys = new Set(buildDefinitions.map(d => d.key));

      // Index discord links by uuid
      const discordLinks: Record<string, { rank: string; discordId: string; ign: string }> = {};
      for (const row of discordLinksResult.rows) {
        discordLinks[row.uuid] = { rank: row.rank, discordId: row.discord_id, ign: row.ign };
      }

      // Index builds by uuid — only these members will be shown
      const buildsByUuid: Record<string, string[]> = {};
      for (const row of buildsResult.rows) {
        // Only include builds that still have a valid definition
        if (!validBuildKeys.has(row.build_key)) continue;
        if (!buildsByUuid[row.uuid]) buildsByUuid[row.uuid] = [];
        buildsByUuid[row.uuid].push(row.build_key);
      }

      // Index flags by uuid
      const flagsByUuid: Record<string, string[]> = {};
      for (const row of flagsResult.rows) {
        if (!flagsByUuid[row.uuid]) flagsByUuid[row.uuid] = [];
        flagsByUuid[row.uuid].push(row.flag);
      }

      // Only include members who have at least one build
      const trackedUuids = new Set(Object.keys(buildsByUuid));
      const guildMembersByUuid = new Map(allMembers.map(m => [m.uuid, m]));

      // Rank priority for sorting
      const rankPriority: Record<string, number> = {
        'Hydra': 1, 'Narwhal': 2, 'Dolphin': 3, 'Sailfish': 4,
        'Hammerhead': 5, 'Angler': 6, 'Barracuda': 7, 'Piranha': 8,
        'Manatee': 9, 'Starfish': 10,
      };

      const members = Array.from(trackedUuids).map(uuid => {
        const guildMember = guildMembersByUuid.get(uuid);
        const discord = discordLinks[uuid];
        return {
          uuid,
          ign: discord?.ign || guildMember?.name || uuid,
          discordRank: discord?.rank || null,
          builds: buildsByUuid[uuid] || [],
          flags: flagsByUuid[uuid] || [],
        };
      });

      members.sort((a, b) => {
        const aPriority = a.discordRank ? (rankPriority[a.discordRank] || 999) : 999;
        const bPriority = b.discordRank ? (rankPriority[b.discordRank] || 999) : 999;
        if (aPriority !== bPriority) return aPriority - bPriority;
        return a.ign.localeCompare(b.ign);
      });

      // Also return all guild members for the "add member" search
      const allGuildMembers = allMembers.map(m => {
        const discord = discordLinks[m.uuid];
        return {
          uuid: m.uuid,
          ign: discord?.ign || m.name,
          discordRank: discord?.rank || null,
        };
      }).filter(m => !trackedUuids.has(m.uuid));

      // Most recent build assignment timestamp
      let lastUpdated: string | null = null;
      for (const row of buildsResult.rows) {
        if (row.created_at && (!lastUpdated || row.created_at > lastUpdated)) {
          lastUpdated = row.created_at;
        }
      }

      return NextResponse.json({ members, allGuildMembers, buildDefinitions, lastUpdated });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Builds fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch build data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, buildKey } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'UUID is required' }, { status: 400 });
    }
    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'Build key is required' }, { status: 400 });
    }

    // Validate build key exists in DB
    const pool = getPool();
    const defCheck = await pool.query('SELECT 1 FROM build_definitions WHERE key = $1', [buildKey]);
    if (defCheck.rowCount === 0) {
      return NextResponse.json({ error: 'Invalid build key' }, { status: 400 });
    }

    await pool.query(
      `INSERT INTO member_builds (uuid, build_key, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [uuid, buildKey, session.ign]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build assign error:', error);
    return NextResponse.json({ error: 'Failed to assign build' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, buildKey } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'UUID is required' }, { status: 400 });
    }
    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'Build key is required' }, { status: 400 });
    }

    const pool = getPool();
    await pool.query(
      `DELETE FROM member_builds WHERE uuid = $1 AND build_key = $2`,
      [uuid, buildKey]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Build remove error:', error);
    return NextResponse.json({ error: 'Failed to remove build' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, flag, action } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'UUID is required' }, { status: 400 });
    }
    if (!flag || !isValidFlagKey(flag)) {
      return NextResponse.json({ error: 'Invalid flag' }, { status: 400 });
    }
    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json({ error: 'Action must be "add" or "remove"' }, { status: 400 });
    }

    const pool = getPool();

    if (action === 'add') {
      await pool.query(
        `INSERT INTO member_war_flags (uuid, flag, assigned_by)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [uuid, flag, session.ign]
      );
    } else {
      await pool.query(
        `DELETE FROM member_war_flags WHERE uuid = $1 AND flag = $2`,
        [uuid, flag]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Flag toggle error:', error);
    return NextResponse.json({ error: 'Failed to update flag' }, { status: 500 });
  }
}
