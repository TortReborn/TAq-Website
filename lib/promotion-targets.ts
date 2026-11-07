import type { Pool, PoolClient } from 'pg';

export interface PromotionTarget {
  rank: string | null;
  ign: string;
  inGuild: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A queued rank change acts on the member as the database has them, not as the
 * request describes them. The roster's name is preferred because
 * discord_links.ign is only a cache and can be out of date.
 */
export async function loadPromotionTargets(
  db: Pool | PoolClient,
  uuids: string[],
): Promise<Map<string, PromotionTarget>> {
  const valid = uuids.filter(uuid => typeof uuid === 'string' && UUID_RE.test(uuid));
  if (valid.length === 0) return new Map();
  const result = await db.query(
    `SELECT dl.uuid::text AS uuid, dl.rank, COALESCE(gr.ign, dl.ign) AS ign,
            gr.uuid IS NOT NULL AS in_guild
       FROM discord_links dl
       LEFT JOIN guild_roster gr ON gr.uuid = dl.uuid
      WHERE dl.uuid = ANY($1::uuid[])`,
    [valid],
  );
  return new Map(
    result.rows.map((row: { uuid: string; rank: string | null; ign: string; in_guild: boolean }) => [
      row.uuid.toLowerCase(),
      { rank: row.rank, ign: row.ign, inGuild: row.in_guild },
    ]),
  );
}

/**
 * Rank changes need the player to still be in the guild. A removal stays valid
 * after they leave, because it also clears their Discord roles and can record
 * an honorific.
 */
export function requiresGuildMembership(actionType: string): boolean {
  return actionType !== 'remove';
}

/** Splits staged actions into those still valid and those whose player left. */
export function splitStagedByMembership<T extends { uuid: string; actionType: string }>(
  staged: T[],
  memberUuids: Iterable<string>,
): { kept: T[]; departed: T[] } {
  const members = new Set(Array.from(memberUuids, uuid => uuid.toLowerCase()));
  const kept: T[] = [];
  const departed: T[] = [];
  for (const action of staged) {
    const left = requiresGuildMembership(action.actionType) && !members.has(action.uuid.toLowerCase());
    (left ? departed : kept).push(action);
  }
  return { kept, departed };
}

export function promotionTarget(
  targets: Map<string, PromotionTarget>,
  uuid: string,
): PromotionTarget | undefined {
  return targets.get(String(uuid).toLowerCase());
}
