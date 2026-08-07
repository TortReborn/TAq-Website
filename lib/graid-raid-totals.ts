type QueryResult<T> = { rows: T[] };
type Queryable = {
  query<T = any>(sql: string, params?: any[]): Promise<QueryResult<T>>;
};

type RaidTotalRow = {
  uuid: string;
  total: string | number;
};

export async function getAllTimeGraidRaidTotals(db: Queryable): Promise<Map<string, number>> {
  const result = await db.query<RaidTotalRow>(`
    SELECT uuid::text AS uuid, SUM(total)::int AS total
    FROM (
      SELECT glp.uuid, COUNT(*)::int AS total
      FROM graid_log_participants glp
      WHERE glp.uuid IS NOT NULL
      GROUP BY glp.uuid

      UNION ALL

      SELECT uuid, raid_offset AS total
      FROM graid_raid_offsets
    ) totals
    GROUP BY uuid
  `);

  return new Map(
    result.rows.map(row => [row.uuid, Number(row.total) || 0])
  );
}

export async function getAllTimeGraidRaidTotal(db: Queryable, uuid: string): Promise<number> {
  const result = await db.query<{ total: string | number }>(`
    SELECT COALESCE(SUM(total), 0)::int AS total
    FROM (
      SELECT COUNT(*)::int AS total
      FROM graid_log_participants
      WHERE uuid = $1

      UNION ALL

      SELECT raid_offset AS total
      FROM graid_raid_offsets
      WHERE uuid = $1
    ) totals
  `, [uuid]);

  return Number(result.rows[0]?.total) || 0;
}
