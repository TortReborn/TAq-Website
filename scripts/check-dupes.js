import fs from 'fs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(__dirname, '..', name);
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv();

const pool = new pg.Pool({
  user: process.env.DB_LOGIN || process.env.TEST_DB_LOGIN,
  password: process.env.DB_PASS || process.env.TEST_DB_PASS,
  host: process.env.DB_HOST || process.env.TEST_DB_HOST,
  port: parseInt(process.env.DB_PORT || process.env.TEST_DB_PORT || '5432'),
  database: process.env.DB_DATABASE || process.env.TEST_DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();

try {
  // Step 0: Count before
  const beforeRes = await client.query('SELECT COUNT(*) AS total FROM territory_exchanges');
  console.log('Before: ' + beforeRes.rows[0].total + ' rows');

  // Step 1: Create temp table with distinct rows
  console.log('Creating temp table with distinct rows...');
  await client.query(
    'CREATE TEMP TABLE te_deduped AS' +
    ' SELECT DISTINCT exchange_time, territory, attacker_name, defender_name' +
    ' FROM territory_exchanges'
  );

  const dedupedRes = await client.query('SELECT COUNT(*) AS total FROM te_deduped');
  console.log('Deduped table: ' + dedupedRes.rows[0].total + ' rows');

  // Step 2: Wrap the swap in a transaction
  console.log('Starting transaction to swap data...');
  await client.query('BEGIN');

  // Step 3: Truncate original
  console.log('Truncating original table...');
  await client.query('TRUNCATE territory_exchanges');

  // Step 4: Insert back from temp
  console.log('Inserting deduplicated rows back...');
  await client.query(
    'INSERT INTO territory_exchanges (exchange_time, territory, attacker_name, defender_name)' +
    ' SELECT exchange_time, territory, attacker_name, defender_name FROM te_deduped'
  );

  // Step 5: Verify count matches
  const afterRes = await client.query('SELECT COUNT(*) AS total FROM territory_exchanges');
  const afterCount = parseInt(afterRes.rows[0].total);
  const expectedCount = parseInt(dedupedRes.rows[0].total);

  if (afterCount === expectedCount) {
    await client.query('COMMIT');
    console.log('COMMIT successful!');
    console.log('After: ' + afterCount + ' rows');
    console.log('Removed: ' + (parseInt(beforeRes.rows[0].total) - afterCount) + ' duplicate rows');
  } else {
    await client.query('ROLLBACK');
    console.error('COUNT MISMATCH! Expected ' + expectedCount + ' but got ' + afterCount + '. ROLLED BACK.');
  }

  // Step 6: Drop temp table
  await client.query('DROP TABLE IF EXISTS te_deduped');

} catch (err) {
  console.error('Error, rolling back:', err.message);
  await client.query('ROLLBACK').catch(() => {});
  await client.query('DROP TABLE IF EXISTS te_deduped').catch(() => {});
} finally {
  client.release();
  await pool.end();
}
