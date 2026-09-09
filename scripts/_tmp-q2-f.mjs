import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const { rows } = await pool.query(
 `SELECT exchange_time, territory, attacker_name, defender_name FROM territory_exchanges
  WHERE (attacker_name='Illustratus' OR defender_name='Illustratus') AND exchange_time>='2018-04-01' AND exchange_time<'2019-01-01' ORDER BY 1`);
for (const r of rows) console.log('  ', r.exchange_time.toISOString().slice(0,16), r.territory.padEnd(28), r.attacker_name, '<-', r.defender_name);
const { rows: r2 } = await pool.query(
 `SELECT to_char(date_trunc('month',exchange_time),'YYYY-MM') m, count(*)::int n FROM territory_exchanges
  WHERE attacker_name='Illustratus' GROUP BY 1 ORDER BY 1`);
console.table(r2);
await pool.end();
