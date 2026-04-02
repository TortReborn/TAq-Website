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
  await migrate('DEV', {
    user: 'tortuser',
    password: 'UserPass123',
    host: '127.0.0.1',
    port: 5432,
    database: 'tortreborn',
    ssl: false,
    connectionTimeoutMillis: 5000,
  });

  await migrate('PROD', {
    user: 'tortuser',
    password: 'npg_5ngEHUhkWNd6',
    host: 'ep-billowing-dream-aasb5bu7-pooler.westus3.azure.neon.tech',
    port: 5432,
    database: 'tortreborn',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  console.log('Done.');
})();
