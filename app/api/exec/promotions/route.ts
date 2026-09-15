import { NextRequest, NextResponse } from 'next/server';
import { requireExecSession, isNarwhalRank } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';
import { RANK_HIERARCHY, PROMO_VISIBILITY_RANK_THRESHOLD_IDX, PROMO_VISIBILITY_MIN_VIEWER_IDX } from '@/lib/rank-constants';
import simpleDatabaseCache from '@/lib/db-cache-simple';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const pool = getPool();
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';

    const [guildDataResult, pendingResult, historyResult, suggestionsResult, allSnapshots] = await Promise.all([
      // Guild members with discord rank
      pool.query(
        `SELECT data->'members' as members FROM cache_entries WHERE cache_key = 'guildData'`
      ),
      // Pending queue
      pool.query(
        `SELECT id, uuid, ign, current_rank, new_rank, action_type,
                queued_by_ign, created_at, status, completed_at, error_message, grant_honorific
         FROM promotion_queue
         WHERE status = 'pending'
         ORDER BY created_at ASC`
      ),
      // Recent history
      pool.query(
        `SELECT id, uuid, ign, current_rank, new_rank, action_type,
                queued_by_ign, created_at, status, completed_at, error_message, grant_honorific
         FROM promotion_queue
         WHERE status IN ('completed', 'failed')
         ORDER BY completed_at DESC
         LIMIT 50`
      ),
      // Promo suggestions (with discord_id from discord_links)
      pool.query(
        `SELECT ps.id, ps.uuid, ps.ign, ps.current_rank, ps.suggested_by_ign, ps.created_at, ps.reason,
                dl.discord_id
         FROM promo_suggestions ps
         LEFT JOIN LATERAL (
           SELECT discord_id
           FROM discord_links
           WHERE uuid = ps.uuid
           LIMIT 1
         ) dl ON TRUE
         ORDER BY ps.created_at DESC`
      ),
      // 7-day activity snapshots
      simpleDatabaseCache.getPlayerActivitySnapshots([7], clientIP),
    ]);

    // Get guild member UUIDs and enrich with discord rank
    const guildMembers: { name: string; uuid: string; playtime?: number; wars?: number; raids?: number; joined?: string }[] = guildDataResult.rows[0]?.members ?? [];
    const memberUuids = guildMembers.map(m => m.uuid);

    // Historical data for 7-day deltas
    const hist7 = allSnapshots[7] || {};

    // Batch lookup discord_links (+ honorifics on record) for all guild members
    let memberRanks: Record<string, string> = {};
    let memberDiscordIds: Record<string, string> = {};
    let memberHonorifics: Record<string, string[]> = {};
    if (memberUuids.length > 0) {
      const dlResult = await pool.query(
        `SELECT dl.uuid, dl.ign, dl.rank, dl.discord_id,
                COALESCE((SELECT array_agg(mh.honorific ORDER BY mh.honorific)
                            FROM member_honorifics mh
                           WHERE mh.uuid = dl.uuid AND mh.revoked_at IS NULL), '{}') AS honorifics
           FROM discord_links dl WHERE dl.uuid = ANY($1::uuid[])`,
        [memberUuids]
      );
      for (const row of dlResult.rows) {
        memberRanks[row.uuid] = row.rank;
        memberDiscordIds[row.uuid] = row.discord_id;
        memberHonorifics[row.uuid] = row.honorifics ?? [];
      }
    }

    const members = guildMembers.map(m => {
      const h = hist7[m.uuid] as { playtime: number; wars: number; raids: number } | undefined;
      const playtime = (m.playtime || 0);
      const wars = (m.wars || 0);
      const raids = (m.raids || 0);
      return {
        uuid: m.uuid,
        ign: m.name,
        rank: memberRanks[m.uuid] || '',
        discordId: memberDiscordIds[m.uuid] || null,
        honorifics: memberHonorifics[m.uuid] || [],
        playtime7d: h ? Math.max(0, playtime - h.playtime) : 0,
        wars7d: h ? Math.max(0, wars - h.wars) : 0,
        raids7d: h ? Math.max(0, raids - h.raids) : 0,
        hasStats: !!h,
        joined: m.joined || null,
      };
    });

    const mapQueueRow = (row: any) => ({
      id: row.id,
      uuid: row.uuid,
      ign: row.ign,
      currentRank: row.current_rank,
      newRank: row.new_rank,
      actionType: row.action_type,
      queuedByIgn: row.queued_by_ign,
      createdAt: row.created_at,
      status: row.status,
      completedAt: row.completed_at,
      errorMessage: row.error_message,
      grantHonorific: row.grant_honorific ?? null,
    });

    const promoSuggestions = suggestionsResult.rows.map((row: any) => ({
      id: row.id,
      uuid: row.uuid,
      ign: row.ign,
      currentRank: row.current_rank,
      suggestedByIgn: row.suggested_by_ign,
      createdAt: row.created_at,
      discordId: row.discord_id || null,
      reason: row.reason || null,
    }));

    // Filter promo suggestions based on viewer's rank
    // Only Narwhal+ can see suggestions for Hammerhead+ members
    let userRankIdx = RANK_HIERARCHY.indexOf(session.rank);
    if (userRankIdx === -1 && session.rank.includes('Hydra')) {
      userRankIdx = RANK_HIERARCHY.indexOf('Hydra');
    }
    const filteredSuggestions = userRankIdx >= PROMO_VISIBILITY_MIN_VIEWER_IDX
      ? promoSuggestions
      : promoSuggestions.filter(s => {
          const idx = RANK_HIERARCHY.indexOf(s.currentRank);
          return idx < PROMO_VISIBILITY_RANK_THRESHOLD_IDX;
        });

    return NextResponse.json({
      members,
      pendingQueue: pendingResult.rows.map(mapQueueRow),
      recentHistory: historyResult.rows.map(mapQueueRow),
      promoSuggestions: filteredSuggestions,
    });
  } catch (error) {
    console.error('Promotions fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch promotions data' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireExecSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { uuid, ign, currentRank, newRank, actionType, grantHonorific } = await request.json();

    if (!uuid || !ign || !currentRank || !actionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['promote', 'demote', 'remove'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 });
    }

    // Enforce: user can only manage members with a rank lower than their own
    const userRankIdx = RANK_HIERARCHY.indexOf(session.rank);
    const targetRankIdx = RANK_HIERARCHY.indexOf(currentRank);
    if (userRankIdx === -1 || targetRankIdx === -1 || targetRankIdx >= userRankIdx) {
      return NextResponse.json({ error: 'You cannot manage members at or above your rank' }, { status: 403 });
    }

    // A removal may carry an honorific grant (TAQ-76). Retired Chief is the
    // higher honor: Narwhal or above only. The bot re-checks on processing.
    let honorific: string | null = null;
    if (grantHonorific) {
      if (actionType !== 'remove') {
        return NextResponse.json({ error: 'An honorific can only be attached to a removal' }, { status: 400 });
      }
      if (!['honored_fish', 'retired_chief'].includes(grantHonorific)) {
        return NextResponse.json({ error: 'Invalid honorific' }, { status: 400 });
      }
      if (grantHonorific === 'retired_chief' && !isNarwhalRank(session.rank)) {
        return NextResponse.json({ error: 'Retired Chief can only be granted by Narwhal or higher' }, { status: 403 });
      }
      honorific = grantHonorific;
    }

    // Validate rank direction
    if (actionType !== 'remove') {
      if (!newRank) {
        return NextResponse.json({ error: 'New rank is required for promote/demote' }, { status: 400 });
      }
      const currentIdx = RANK_HIERARCHY.indexOf(currentRank);
      const newIdx = RANK_HIERARCHY.indexOf(newRank);
      if (currentIdx === -1 || newIdx === -1) {
        return NextResponse.json({ error: 'Invalid rank' }, { status: 400 });
      }
      if (actionType === 'promote' && newIdx <= currentIdx) {
        return NextResponse.json({ error: 'New rank must be higher for promotion' }, { status: 400 });
      }
      if (actionType === 'demote' && newIdx >= currentIdx) {
        return NextResponse.json({ error: 'New rank must be lower for demotion' }, { status: 400 });
      }
    }

    const pool = getPool();

    // Check for duplicate pending entry
    const existing = await pool.query(
      `SELECT id FROM promotion_queue WHERE uuid = $1 AND status = 'pending'`,
      [uuid]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json({ error: 'This player already has a pending promotion/demotion' }, { status: 409 });
    }

    await pool.query(
      `INSERT INTO promotion_queue (uuid, ign, current_rank, new_rank, action_type, queued_by_discord_id, queued_by_ign, grant_honorific)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [uuid, ign, currentRank, newRank || null, actionType, session.discord_id, session.ign, honorific]
    );

    // Auto-remove from promo suggestions if present
    await pool.query(`DELETE FROM promo_suggestions WHERE uuid = $1`, [uuid]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Promotion queue error:', error);
    return NextResponse.json({ error: 'Failed to queue promotion' }, { status: 500 });
  }
}
