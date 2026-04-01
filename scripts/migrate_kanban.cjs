const { Pool } = require('pg');

const MIGRATION = `
BEGIN;

-- Add due_date column
ALTER TABLE tracker_tickets ADD COLUMN IF NOT EXISTS due_date DATE;

-- Drop old status constraint
ALTER TABLE tracker_tickets DROP CONSTRAINT IF EXISTS tracker_tickets_status_check;

-- Remap old statuses to new ones
UPDATE tracker_tickets SET status = 'untriaged' WHERE status = 'open';
UPDATE tracker_tickets SET status = 'deployed'  WHERE status = 'resolved';
UPDATE tracker_tickets SET status = 'declined'  WHERE status = 'closed';

-- Add new constraint with all 5 statuses
ALTER TABLE tracker_tickets
  ADD CONSTRAINT tracker_tickets_status_check
  CHECK (status IN ('untriaged', 'todo', 'in_progress', 'deployed', 'declined'));

-- Update default
ALTER TABLE tracker_tickets ALTER COLUMN status SET DEFAULT 'untriaged';

COMMIT;
`;

async function migrate(label, config) {
  const pool = new Pool(config);
  try {
    console.log(`${label}: Running kanban migration...`);
    await pool.query(MIGRATION);
    console.log(`${label}: Migration complete.`);

    const res = await pool.query('SELECT id, status, due_date FROM tracker_tickets LIMIT 5');
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
