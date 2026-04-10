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
      // Fetch definitions, versions, discord links, builds, and flags in parallel
      const [defsResult, versionsResult, discordLinksResult, buildsResult, flagsResult] = await Promise.all([
        client.query('SELECT key, name, role, color, sort_order FROM build_definitions ORDER BY sort_order'),
        client.query(
          'SELECT build_key, major, minor, conns_url, hq_url, notes, created_at, created_by FROM build_versions ORDER BY build_key, major DESC, minor DESC'
        ),
        client.query('SELECT uuid, rank, discord_id, ign FROM discord_links'),
        client.query('SELECT uuid, build_key, version_major, version_minor, created_at FROM member_builds'),
        client.query('SELECT uuid, flag FROM member_war_flags'),
      ]);

      // Group versions by build_key (already sorted newest first by query)
      const versionsByKey: Record<string, any[]> = {};
      for (const row of versionsResult.rows) {
        if (!versionsByKey[row.build_key]) versionsByKey[row.build_key] = [];
        versionsByKey[row.build_key].push({
          major: row.major,
          minor: row.minor,
          connsUrl: row.conns_url,
          hqUrl: row.hq_url,
          notes: row.notes,
          createdAt: row.created_at,
          createdBy: row.created_by,
        });
      }

      // Build definitions with attached versions
      const buildDefinitions = defsResult.rows.map(row => {
        const versions = versionsByKey[row.key] ?? [];
        const latest = versions[0]
          ? { major: versions[0].major, minor: versions[0].minor }
          : null;
        return {
          key: row.key,
          name: row.name,
          role: row.role,
          color: row.color,
          sortOrder: row.sort_order,
          versions,
          latestVersion: latest,
        };
      });

      // Valid build keys from DB
      const validBuildKeys = new Set(buildDefinitions.map(d => d.key));

      // Index discord links by uuid
      const discordLinks: Record<string, { rank: string; discordId: string; ign: string }> = {};
      for (const row of discordLinksResult.rows) {
        discordLinks[row.uuid] = { rank: row.rank, discordId: row.discord_id, ign: row.ign };
      }

      // Index builds by uuid — only these members will be shown.
      // Each entry is { buildKey, major, minor }.
      const buildsByUuid: Record<string, { buildKey: string; major: number; minor: number }[]> = {};
      for (const row of buildsResult.rows) {
        if (!validBuildKeys.has(row.build_key)) continue;
        if (!buildsByUuid[row.uuid]) buildsByUuid[row.uuid] = [];
        buildsByUuid[row.uuid].push({
          buildKey: row.build_key,
          major: row.version_major,
          minor: row.version_minor,
        });
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
    const { uuid, buildKey, major, minor } = await request.json();
    if (!uuid || typeof uuid !== 'string') {
      return NextResponse.json({ error: 'UUID is required' }, { status: 400 });
    }
    if (!buildKey || typeof buildKey !== 'string') {
      return NextResponse.json({ error: 'Build key is required' }, { status: 400 });
    }

    const pool = getPool();

    // Validate build definition exists
    const defCheck = await pool.query('SELECT 1 FROM build_definitions WHERE key = $1', [buildKey]);
    if (defCheck.rowCount === 0) {
      return NextResponse.json({ error: 'Invalid build key' }, { status: 400 });
    }

    // Resolve the target version. If caller didn't specify, default to latest.
    let resolvedMajor: number | null = null;
    let resolvedMinor: number | null = null;
    if (typeof major === 'number' && typeof minor === 'number') {
      const versionCheck = await pool.query(
        'SELECT 1 FROM build_versions WHERE build_key = $1 AND major = $2 AND minor = $3',
        [buildKey, major, minor]
      );
      if (versionCheck.rowCount === 0) {
        return NextResponse.json({ error: 'Invalid build version' }, { status: 400 });
      }
      resolvedMajor = major;
      resolvedMinor = minor;
    } else {
      const latest = await pool.query(
        'SELECT major, minor FROM build_versions WHERE build_key = $1 ORDER BY major DESC, minor DESC LIMIT 1',
        [buildKey]
      );
      if (latest.rowCount === 0) {
        return NextResponse.json({ error: 'Build has no versions' }, { status: 400 });
      }
      resolvedMajor = latest.rows[0].major;
      resolvedMinor = latest.rows[0].minor;
    }

    // Upsert: a member only ever has one version of a given build.
    // Switching versions is the same operation as initial assignment.
    await pool.query(
      `INSERT INTO member_builds (uuid, build_key, version_major, version_minor, assigned_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (uuid, build_key) DO UPDATE
         SET version_major = EXCLUDED.version_major,
             version_minor = EXCLUDED.version_minor,
             assigned_by   = EXCLUDED.assigned_by`,
      [uuid, buildKey, resolvedMajor, resolvedMinor, session.ign]
    );

    return NextResponse.json({ success: true, version: { major: resolvedMajor, minor: resolvedMinor } });
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
