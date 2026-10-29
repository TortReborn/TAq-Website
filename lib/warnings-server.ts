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
 * Resolve a typed name to a player. Order matters:
 *   1. discord_links — current name, and it carries the Discord id the bot needs for the role.
 *   2. warning_profiles — someone already on file who has since left or unlinked.
 *   3. Mojang — anyone else.
 * Whatever the source, the Discord id comes from discord_links by uuid when there is one.
 */
export async function resolveWarningPlayer(
  pool: Pool,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ResolvedPlayer> {
  const key = name.toLowerCase();

  const linked = await pool.query(
    `SELECT uuid::text AS uuid, ign, discord_id::text AS discord_id
     FROM discord_links WHERE LOWER(ign) = $1
     ORDER BY EXISTS (SELECT 1 FROM guild_roster gr WHERE gr.uuid = discord_links.uuid) DESC, linked_at DESC
     LIMIT 1`,
    [key]
  );
  if (linked.rows.length > 0) {
    const r = linked.rows[0];
    return { uuid: r.uuid, ign: r.ign, discordId: r.discord_id };
  }

  const onFile = await pool.query(
    `SELECT uuid::text AS uuid, ign, discord_id::text AS discord_id
     FROM warning_profiles WHERE LOWER(ign) = $1 LIMIT 1`,
    [key]
  );
  if (onFile.rows.length > 0) {
    const r = onFile.rows[0];
    return { uuid: r.uuid, ign: r.ign, discordId: r.discord_id };
  }

  let res: Response;
  try {
    res = await fetchImpl(
      `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
      { signal: AbortSignal.timeout(8000) }
    );
  } catch {
    throw new PlayerLookupError('Could not reach Mojang to look up that player. Try again in a minute.');
  }
  if (res.status === 404 || res.status === 204) {
    throw new PlayerNotFoundError(`No Minecraft account is named "${name}".`);
  }
  if (!res.ok) {
    throw new PlayerLookupError('Could not reach Mojang to look up that player. Try again in a minute.');
  }
  const data = await res.json();
  const uuid = dashUuid(data.id);

  const byUuid = await pool.query(
    `SELECT discord_id::text AS discord_id FROM discord_links WHERE uuid = $1 LIMIT 1`,
    [uuid]
  );
  return { uuid, ign: data.name, discordId: byUuid.rows[0]?.discord_id ?? null };
}
