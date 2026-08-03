import type { Pool } from 'pg';

// discord_links can hold several rows per player and per ign (relinks,
// unlinked history) — always prefer the live linked row, then rows with a
// rank recorded, so lookups pick one stable best link instead of fanning out.
const BEST_LINK_ORDER = `linked DESC, (rank <> '') DESC, discord_id`;

/**
 * Resolve a batch of IGNs → uuids in one query.
 * Returns a map keyed by lowercased ign; IGNs with no discord_links row
 * (or a row without a uuid recorded) map to null.
 */
export async function resolveUuidsByIgns(pool: Pool, igns: string[]): Promise<Map<string, string | null>> {
  const keys = [...new Set(igns.map(ign => ign.toLowerCase()))];
  const uuidByIgn = new Map<string, string | null>(keys.map(key => [key, null]));
  if (keys.length === 0) return uuidByIgn;

  const result = await pool.query(
    `SELECT DISTINCT ON (LOWER(ign)) LOWER(ign) AS key, uuid
     FROM discord_links
     WHERE LOWER(ign) = ANY($1::text[])
     ORDER BY LOWER(ign), ${BEST_LINK_ORDER}`,
    [keys]
  );
  for (const row of result.rows) {
    uuidByIgn.set(row.key, row.uuid);
  }
  return uuidByIgn;
}

/** Resolve a single IGN → uuid (best link), or null if unknown. */
export async function resolveUuidByIgn(pool: Pool, ign: string): Promise<string | null> {
  const uuidByIgn = await resolveUuidsByIgns(pool, [ign]);
  return uuidByIgn.get(ign.toLowerCase()) ?? null;
}

/** Current display name for a uuid from its best discord_links row, or null. */
export async function lookupIgnByUuid(pool: Pool, uuid: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT ign FROM discord_links WHERE uuid = $1 ORDER BY ${BEST_LINK_ORDER} LIMIT 1`,
    [uuid]
  );
  return result.rows.length > 0 ? result.rows[0].ign : null;
}
