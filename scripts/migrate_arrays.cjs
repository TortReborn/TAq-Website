const { Pool } = require('pg');

// Convert type back from TEXT[] to VARCHAR(20), keep system as TEXT[]
const MIGRATION = `
ALTER TABLE tracker_tickets
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE VARCHAR(20) USING type[1],
  ALTER COLUMN type SET NOT NULL,
  ADD CONSTRAINT tracker_tickets_type_check CHECK (type IN ('bug', 'feature'));
`;

async function migrate(label, config) {
  const pool = new Pool(config);
  try {
    const check = await pool.query(
      "SELECT data_type FROM information_schema.columns WHERE table_name = 'tracker_tickets' AND column_name = 'type'"
    );
    const currentType = check.rows[0]?.data_type;
    console.log(`${label}: current 'type' column data_type = ${currentType}`);

    if (currentType === 'ARRAY') {
      await pool.query(MIGRATION);
      console.log(`${label}: type reverted to VARCHAR`);
    } else {
      console.log(`${label}: type already VARCHAR, skipping`);
    }

    const res = await pool.query('SELECT id, type, system FROM tracker_tickets LIMIT 3');
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
