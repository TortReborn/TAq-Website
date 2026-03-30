const { Pool } = require('pg');

async function check(label, config) {
  const pool = new Pool(config);
  try {
    const r = await pool.query(
      "SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'tracker_tickets' ORDER BY ordinal_position"
    );
    console.log(`\n=== ${label} ===`);
    r.rows.forEach(row => console.log(`  ${row.column_name}: ${row.data_type} (${row.udt_name})`));
  } catch (e) {
    console.error(`${label} error:`, e.message);
  } finally {
    await pool.end();
  }
}

(async () => {
  await check('DEV', {
    user: 'tortuser', password: 'UserPass123', host: '127.0.0.1',
    port: 5432, database: 'tortreborn', ssl: false, connectionTimeoutMillis: 5000,
  });
  await check('PROD', {
    user: 'tortuser', password: 'npg_5ngEHUhkWNd6',
    host: 'ep-billowing-dream-aasb5bu7-pooler.westus3.azure.neon.tech',
    port: 5432, database: 'tortreborn', ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000,
  });
})();
