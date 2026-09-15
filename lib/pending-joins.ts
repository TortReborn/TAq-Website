import type { Pool, PoolClient } from 'pg';

/**
 * Count accepted guild applicants who haven't joined the guild yet.
 *
 * An applicant has joined once they are on the roster, or a membership
 * stint opened for the Minecraft account on their discord_links row from
 * around the time they applied (TAQ-76; a week of slack covers players who
 * joined in-game just before applying). "On the roster now" would be wrong here: someone who joined and
 * later left must not become pending again. NOT EXISTS keeps applicants
 * with no link at all counted as pending.
 *
 * Accepted applications whose ticket is closed before the player ever
 * joins are moved to status 'expired' by the bot (and by the
 * sql/add_expired_application_status.sql backfill), so they drop out of
 * this count instead of accumulating forever (TAQ-77).
 */
export async function countPendingJoins(db: Pool | PoolClient): Promise<number> {
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM applications a
     WHERE a.status = 'accepted'
       AND a.application_type = 'guild'
       AND NOT EXISTS (
         SELECT 1 FROM discord_links dl
         JOIN membership_stints ms ON ms.uuid = dl.uuid
         WHERE dl.discord_id = CAST(a.discord_id AS BIGINT)
           AND (ms.left_at IS NULL
                OR ms.joined_at >= COALESCE(a.submitted_at, a.reviewed_at, ms.joined_at) - INTERVAL '7 days')
       )`
  );
  return result.rows[0]?.count ?? 0;
}
