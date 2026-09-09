import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const { rows } = await pool.query(`
  SELECT name, count(*)::int n, min(exchange_time) first, max(exchange_time) last FROM (
    SELECT attacker_name AS name, exchange_time FROM territory_exchanges WHERE exchange_time >= '2018-03-25' AND exchange_time < '2018-05-05'
    UNION ALL
    SELECT defender_name, exchange_time FROM territory_exchanges WHERE exchange_time >= '2018-03-25' AND exchange_time < '2018-05-05'
  ) t GROUP BY name ORDER BY n DESC`);
for (const r of rows) console.log(String(r.n).padStart(6), r.name, '|', r.first.toISOString().slice(0,10), r.last.toISOString().slice(0,10));
await pool.end();
