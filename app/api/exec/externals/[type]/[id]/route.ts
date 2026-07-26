import { NextRequest, NextResponse } from 'next/server';
import { requireNarwhalSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const EXCEPTION_TYPES = new Set(['alt', 'rank_exception', 'role_exception', 'other']);

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { type: string; id: string } }
) {
  const session = await requireNarwhalSession(request);
  if (!session) return NextResponse.json({ error: 'Narwhal access required.' }, { status: 403 });

  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0 || !['exception', 'alliance'].includes(params.type)) {
    return NextResponse.json({ error: 'Invalid record.' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const pool = getPool();
  try {
    if (params.type === 'exception') {
      const ign = text(body.ign);
      const exceptionType = text(body.exceptionType) ?? 'other';
      if (!ign || !EXCEPTION_TYPES.has(exceptionType)) {
        return NextResponse.json({ error: 'IGN and a valid exception type are required.' }, { status: 400 });
      }
      await pool.query(
        `UPDATE management_exceptions
         SET discord_user = $1, discord_id = $2, ign = $3, minecraft_uuid = $4,
             exception_type = $5, linked_main = $6, account_owner = $7,
             in_game_rank = $8, taq_role = $9, access_notes = $10, notes = $11,
             updated_by = $12, updated_at = NOW()
         WHERE id = $13`,
        [
          text(body.discordUser), text(body.discordId), ign, text(body.minecraftUuid),
          exceptionType, text(body.linkedMain), text(body.accountOwner), text(body.inGameRank),
          text(body.taqRole), text(body.accessNotes), text(body.notes), session.ign, id,
        ]
      );
    } else {
      const guildName = text(body.guildName);
      const prefix = text(body.guildPrefix);
      const roleId = text(body.discordRoleId);
      if (!guildName || !prefix || !roleId || !/^\d{15,22}$/.test(roleId)) {
        return NextResponse.json({ error: 'Guild name, prefix, and an existing Discord role ID are required.' }, { status: 400 });
      }
      await pool.query(
        `UPDATE guild_alliances
         SET guild_name = $1, guild_prefix = $2, discord_role_id = $3,
             display_rank = $4, notes = $5, enabled = $6,
             updated_by = $7, updated_at = NOW()
         WHERE id = $8`,
        [guildName, prefix, roleId, text(body.displayRank) ?? 'Navigator', text(body.notes), body.enabled !== false, session.ign, id]
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Externals update error:', error);
    return NextResponse.json({ error: 'Failed to update record.' }, { status: 500 });
  }
}
