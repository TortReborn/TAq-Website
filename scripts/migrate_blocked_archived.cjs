// TAQ-26: Apply the blocked/archived status migration to dev + prod.
// Reads DB_* (prod/Neon) and TEST_DB_* (dev/local) from .env.

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Lightweight .env parser (dotenv isn't a dep of this project).
const envPath = path.join(__dirname, '..', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !(m[1] in process.env)) {
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}

const SQL = fs.readFileSync(
  path.join(__dirname, '..', 'sql', 'add_blocked_archived_statuses.sql'),
  'utf8'
);

async function migrate(label, config) {
  const pool = new Pool(config);
  try {
    console.log(`${label}: applying migration...`);
    await pool.query(SQL);
    const res = await pool.query(
      `SELECT conname, pg_get_constraintdef(oid) AS def
         FROM pg_constraint
        WHERE conrelid = 'tracker_tickets'::regclass
          AND conname = 'tracker_tickets_status_check'`
    );
    console.log(`${label}: ${res.rows[0]?.def || '(constraint not found)'}`);
  } catch (e) {
    console.error(`${label} ERROR:`, e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

(async () => {
  await migrate('DEV', {
    user: process.env.TEST_DB_LOGIN,
    password: process.env.TEST_DB_PASS,
    host: process.env.TEST_DB_HOST,
    port: parseInt(process.env.TEST_DB_PORT, 10),
    database: process.env.TEST_DB_DATABASE,
    ssl: process.env.TEST_DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });

  await migrate('PROD', {
    user: process.env.DB_LOGIN,
    password: process.env.DB_PASS,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSLMODE === 'require' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });

  console.log('Done.');
})();
