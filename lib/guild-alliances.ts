import type { Pool } from 'pg';

export async function isAllyRank(pool: Pool, rank: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM rank_definitions WHERE name = $1 AND kind = 'ally'`,
    [rank],
  );
  return result.rows.length > 0;
}
