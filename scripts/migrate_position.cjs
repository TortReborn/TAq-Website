const DB = require('./lib/db-config.cjs');
const { Pool } = require('pg');

const MIGRATION = `
BEGIN;

-- Add position column
ALTER TABLE tracker_tickets ADD COLUMN IF NOT EXISTS position INT NOT NULL DEFAULT 0;

-- Initialize positions per-column based on existing created_at order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY status ORDER BY created_at DESC) - 1 AS pos
  FROM tracker_tickets
)
UPDATE tracker_tickets t SET position = r.pos FROM ranked r WHERE t.id = r.id;

COMMIT;
`;

async function migrate(label, config) {
  const pool = new Pool(config);
  try {
    console.log(`${label}: Running position migration...`);
    await pool.query(MIGRATION);
    console.log(`${label}: Migration complete.`);

    const res = await pool.query('SELECT id, status, position FROM tracker_tickets ORDER BY status, position LIMIT 10');
    console.log(`${label} sample:`, JSON.stringify(res.rows, null, 2));
  } catch (e) {
    console.error(`${label} error:`, e.message);
  } finally {
    await pool.end();
  }
}

(async () => {
  await migrate('DEV', DB.dev());

  await migrate('PROD', DB.prod());

  console.log('Done.');
})();
