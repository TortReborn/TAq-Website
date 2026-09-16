import { getPool } from '@/lib/db';

/**
 * The player's Wynncraft guild tier (recruit … owner, lower case as the bot
 * writes it) from guild_roster, or null when they are not on the roster.
 * Postgres' uuid type accepts the undashed form, so callers can pass either.
 */
export async function getGuildRosterRank(uuid: string): Promise<string | null> {
  const result = await getPool().query<{ in_game_rank: string | null }>(
    `SELECT in_game_rank FROM guild_roster WHERE uuid = $1::uuid`,
    [uuid],
  );
  return result.rows[0]?.in_game_rank ?? null;
}
