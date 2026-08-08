import type { NextRequest } from 'next/server';
import type { Pool } from 'pg';
import { ExecSessionData, isNarwhalRank, requireExecSession } from '@/lib/exec-auth';
import { getPool } from '@/lib/db';

// Who may edit the exec Inventory page. Narwhal+ always may; anyone else
// needs a row in inventory_editors, granted by a narwhal. See TAQ-62.

export interface InventoryEditor {
  discordId: string;
  ign: string | null;
  rank: string | null;
  grantedBy: string;
  grantedByIgn: string;
  note: string;
  grantedAt: string;
}

export async function hasInventoryGrant(discordId: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM inventory_editors WHERE discord_id = $1`,
    [discordId]
  );
  return result.rows.length > 0;
}

export async function canEditInventory(session: ExecSessionData): Promise<boolean> {
  if (isNarwhalRank(session.rank)) return true;
  return hasInventoryGrant(session.discord_id);
}

/**
 * Guard for inventory write endpoints: a valid exec session that is either
 * Narwhal+ or holds an inventory edit grant. Returns null for the caller to
 * turn into a 403, mirroring requireNarwhalSession.
 */
export async function requireInventoryEditorSession(request: NextRequest): Promise<ExecSessionData | null> {
  const session = await requireExecSession(request);
  if (!session) return null;
  return (await canEditInventory(session)) ? session : null;
}

export async function listInventoryEditors(pool: Pool): Promise<InventoryEditor[]> {
  const result = await pool.query(
    `SELECT e.discord_id, e.granted_by, e.granted_by_ign, e.note, e.granted_at,
            l.ign, l.rank
     FROM inventory_editors e
     LEFT JOIN discord_links l ON l.discord_id = e.discord_id
     ORDER BY l.ign NULLS LAST, e.discord_id`
  );
  return result.rows.map(row => ({
    discordId: String(row.discord_id),
    ign: row.ign,
    rank: row.rank,
    grantedBy: String(row.granted_by),
    grantedByIgn: row.granted_by_ign,
    note: row.note,
    grantedAt: row.granted_at,
  }));
}
