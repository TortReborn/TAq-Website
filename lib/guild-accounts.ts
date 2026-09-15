import type { Pool, PoolClient } from 'pg';

/**
 * Guild-owned in-game accounts (TAQ-88): Woealer holds the ingredient stock,
 * GordLonner holds the guild's LE. They are on guild_roster because they are
 * in the guild, and unlinked because there is no person behind them.
 * Everything that judges *members* — inactivity, kick candidates, "not
 * linked" nags, leave-message buttons — must skip them.
 *
 * The record lives in management_exceptions (exception_type = 'guild_account',
 * minecraft_uuid set). One query; callers compare with dashless uuids.
 */
export const GUILD_ACCOUNT_TYPE = 'guild_account';

export function uuidKey(uuid: string | null | undefined): string {
  return (uuid ?? '').replace(/-/g, '').toLowerCase();
}

export async function guildAccountUuids(db: Pool | PoolClient): Promise<Set<string>> {
  const result = await db.query(
    `SELECT minecraft_uuid::text AS uuid
       FROM management_exceptions
      WHERE exception_type = $1 AND minecraft_uuid IS NOT NULL`,
    [GUILD_ACCOUNT_TYPE]
  );
  return new Set(result.rows.map((row: { uuid: string }) => uuidKey(row.uuid)));
}

/** Drop guild accounts from a member-shaped list. */
export function withoutGuildAccounts<T extends { uuid: string }>(members: T[], guildAccounts: Set<string>): T[] {
  if (guildAccounts.size === 0) return members;
  return members.filter(m => !guildAccounts.has(uuidKey(m.uuid)));
}
