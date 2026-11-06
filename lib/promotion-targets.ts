import type { Pool, PoolClient } from 'pg';

export interface PromotionTarget {
  rank: string | null;
  ign: string;
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
    `SELECT dl.uuid::text AS uuid, dl.rank, COALESCE(gr.ign, dl.ign) AS ign
       FROM discord_links dl
       LEFT JOIN guild_roster gr ON gr.uuid = dl.uuid
      WHERE dl.uuid = ANY($1::uuid[])`,
    [valid],
  );
  return new Map(
    result.rows.map((row: { uuid: string; rank: string | null; ign: string }) => [
      row.uuid.toLowerCase(),
      { rank: row.rank, ign: row.ign },
    ]),
  );
}

export function promotionTarget(
  targets: Map<string, PromotionTarget>,
  uuid: string,
): PromotionTarget | undefined {
  return targets.get(String(uuid).toLowerCase());
}
