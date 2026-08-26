import type { Pool, PoolClient } from 'pg';

/**
 * Count accepted guild applicants who haven't joined the guild yet.
 *
 * An applicant has joined once they have a live discord_links row
 * (linked = TRUE). NOT EXISTS is used rather than a JOIN on
 * linked = FALSE because discord_links keeps historical unlinked rows
 * alongside the live one — a JOIN would count players who already joined
 * but still carry a stale row, once per stale row.
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
         WHERE dl.discord_id = CAST(a.discord_id AS BIGINT)
           AND dl.linked = TRUE
       )`
  );
  return result.rows[0]?.count ?? 0;
}
