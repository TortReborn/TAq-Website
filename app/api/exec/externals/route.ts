import { NextRequest, NextResponse } from 'next/server';
import { requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCEPTION_TYPES = new Set(['alt', 'rank_exception', 'role_exception', 'other']);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function load() {
  const pool = getPool();
  const [exceptions, alliances] = await Promise.all([
    pool.query(
      `SELECT id, discord_user, discord_id, ign, minecraft_uuid, exception_type,
              linked_main, account_owner, in_game_rank, taq_role, access_notes,
              notes, updated_by, updated_at
       FROM management_exceptions
       ORDER BY LOWER(ign)`
    ),
    pool.query(
      `SELECT id, guild_name, guild_prefix, discord_role_id, display_rank, notes,
              enabled, updated_by, updated_at
       FROM guild_alliances
       ORDER BY enabled DESC, LOWER(guild_name)`
    ),
  ]);
  return {
    exceptions: exceptions.rows.map(row => ({
      id: Number(row.id),
      discordUser: row.discord_user,
      discordId: row.discord_id ? String(row.discord_id) : null,
      ign: row.ign,
      minecraftUuid: row.minecraft_uuid,
      exceptionType: row.exception_type,
      linkedMain: row.linked_main,
      accountOwner: row.account_owner,
      inGameRank: row.in_game_rank,
      taqRole: row.taq_role,
      accessNotes: row.access_notes,
      notes: row.notes,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })),
    alliances: alliances.rows.map(row => ({
      id: Number(row.id),
      guildName: row.guild_name,
      guildPrefix: row.guild_prefix,
      discordRoleId: String(row.discord_role_id),
      displayRank: row.display_rank,
      notes: row.notes,
      enabled: row.enabled,
      updatedBy: row.updated_by,
      updatedAt: row.updated_at,
    })),
  };
}

export async function GET(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });
  try {
    return NextResponse.json(await load());
  } catch (error) {
    console.error('Externals fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch externals.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const pool = getPool();
  try {
    if (body.action === 'createException') {
      const ign = text(body.ign);
      const exceptionType = text(body.exceptionType) ?? 'other';
      if (!ign || !EXCEPTION_TYPES.has(exceptionType)) {
        return NextResponse.json({ error: 'IGN and a valid exception type are required.' }, { status: 400 });
      }
      await pool.query(
        `INSERT INTO management_exceptions (
           discord_user, discord_id, ign, minecraft_uuid, exception_type, linked_main,
           account_owner, in_game_rank, taq_role, access_notes, notes, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`,
        [
          text(body.discordUser), text(body.discordId), ign, text(body.minecraftUuid),
          exceptionType, text(body.linkedMain), text(body.accountOwner), text(body.inGameRank),
          text(body.taqRole), text(body.accessNotes), text(body.notes), session.ign,
        ]
      );
    } else if (body.action === 'createAlliance') {
      const guildName = text(body.guildName);
      const prefix = text(body.guildPrefix);
      const roleId = text(body.discordRoleId);
      if (!guildName || !prefix || !roleId || !/^\d{15,22}$/.test(roleId)) {
        return NextResponse.json({ error: 'Guild name, prefix, and an existing Discord role ID are required.' }, { status: 400 });
      }
      await pool.query(
        `INSERT INTO guild_alliances (
           guild_name, guild_prefix, discord_role_id, display_rank, notes, enabled, created_by, updated_by
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
        [guildName, prefix, roleId, text(body.displayRank) ?? 'Navigator', text(body.notes), body.enabled !== false, session.ign]
      );
    } else {
      return NextResponse.json({ error: 'Unknown externals action.' }, { status: 400 });
    }
    return NextResponse.json({ success: true, ...(await load()) });
  } catch (error) {
    console.error('Externals create error:', error);
    const duplicate = (error as { code?: string }).code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'That alliance already exists.' : 'Failed to save externals data.' },
      { status: duplicate ? 409 : 500 }
    );
  }
}
