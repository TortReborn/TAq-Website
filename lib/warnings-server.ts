import type { Pool } from 'pg';

/** The exec Discord, where the warning forum lives. */
export const TE_GUILD_ID = '784795827808763904';

export function threadUrl(threadId: string | null): string | null {
  return threadId ? `https://discord.com/channels/${TE_GUILD_ID}/${threadId}` : null;
}

export interface ResolvedPlayer {
  uuid: string;
  ign: string;
  discordId: string | null;
}

function dashUuid(raw: string): string {
  return [raw.slice(0, 8), raw.slice(8, 12), raw.slice(12, 16), raw.slice(16, 20), raw.slice(20)].join('-');
}

export class PlayerNotFoundError extends Error {}
export class PlayerLookupError extends Error {}

/**
 * Resolve a typed name to a player. Everything after this keys on the uuid.
 *   1. Mojang: whoever owns the name now. The names cached in discord_links and
 *      warning_profiles go stale on renames, and a stale one can belong to someone
 *      else today, so they never outrank Mojang.
 *   2. A name nobody owns now: an old name of someone already on file or linked.
 * The Discord id always comes from discord_links by uuid, never by name. A Mojang
 * outage is an error, not a guess from the caches.
 */
export async function resolveWarningPlayer(
  pool: Pool,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedPlayer> {
  let res: Response;
  try {
    res = await fetchImpl(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(8000) }
    );
  } catch {
    throw new PlayerLookupError('Could not reach Mojang to look up that player. Try again in a minute.');
  }

  let uuid: string;
  let ign: string;
  if (res.status === 404 || res.status === 204) {
    const former = await pool.query(
      `SELECT uuid::text AS uuid, ign FROM (
         SELECT uuid, ign, updated_at AS seen FROM warning_profiles WHERE LOWER(ign) = $1
         UNION ALL
         SELECT uuid, ign, linked_at AS seen FROM discord_links WHERE LOWER(ign) = $1
       ) names
       ORDER BY seen DESC
       LIMIT 1`,
      [name.toLowerCase()]
    );
    if (former.rows.length === 0) {
      throw new PlayerNotFoundError(`No Minecraft account is named "${name}".`);
    }
    ({ uuid, ign } = former.rows[0]);
  } else if (res.ok) {
    const data = await res.json();
    uuid = dashUuid(data.id);
    ign = data.name;
  } else {
    throw new PlayerLookupError('Could not reach Mojang to look up that player. Try again in a minute.');
  }

  const linked = await pool.query(
    `SELECT discord_id::text AS discord_id FROM discord_links WHERE uuid = $1 LIMIT 1`,
    [uuid]
  );
  return { uuid, ign, discordId: linked.rows[0]?.discord_id ?? null };
}
