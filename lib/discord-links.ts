import type { Pool } from 'pg';

// discord_links is identity: one row per Discord account, one per uuid
// (TAQ-76). Two accounts can still carry the same cached *name* across a
// rename, so name lookups prefer a current guild member and otherwise take
// the most recently linked row.
const NAME_TIE_BREAK = `EXISTS (SELECT 1 FROM guild_roster gr WHERE gr.uuid = discord_links.uuid) DESC, linked_at DESC`;

/**
 * Resolve a batch of IGNs → uuids in one query.
 * Returns a map keyed by lowercased ign; IGNs with no discord_links row map to null.
 */
export async function resolveUuidsByIgns(pool: Pool, igns: string[]): Promise<Map<string, string | null>> {
  const keys = [...new Set(igns.map(ign => ign.toLowerCase()))];
  const uuidByIgn = new Map<string, string | null>(keys.map(key => [key, null]));
  if (keys.length === 0) return uuidByIgn;

  const result = await pool.query(
    `SELECT DISTINCT ON (LOWER(ign)) LOWER(ign) AS key, uuid
     FROM discord_links
     WHERE LOWER(ign) = ANY($1::text[])
     ORDER BY LOWER(ign), ${NAME_TIE_BREAK}`,
    [keys]
  );
  for (const row of result.rows) {
    uuidByIgn.set(row.key, row.uuid);
  }
  return uuidByIgn;
}

/** Resolve a single IGN → uuid, or null if unknown. */
export async function resolveUuidByIgn(pool: Pool, ign: string): Promise<string | null> {
  const uuidByIgn = await resolveUuidsByIgns(pool, [ign]);
  return uuidByIgn.get(ign.toLowerCase()) ?? null;
}

/** Current display name for a uuid from its discord_links row, or null. */
export async function lookupIgnByUuid(pool: Pool, uuid: string): Promise<string | null> {
  const result = await pool.query(
    `SELECT ign FROM discord_links WHERE uuid = $1 LIMIT 1`,
    [uuid]
  );
  return result.rows.length > 0 ? result.rows[0].ign : null;
}
