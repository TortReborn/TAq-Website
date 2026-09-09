import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
async function shows(name, from, to) {
  const { rows } = await pool.query(
    `SELECT exchange_time, territory, attacker_name, defender_name FROM territory_exchanges
     WHERE (attacker_name=$1 OR defender_name=$1) AND exchange_time>=$2 AND exchange_time<$3
     ORDER BY exchange_time`, [name, from, to]);
  console.log('=== '+name+' '+from+' .. '+to+' : '+rows.length+' rows');
  for (const r of rows.slice(0,60)) console.log('  ', r.exchange_time.toISOString().slice(0,16), r.territory, '|', r.attacker_name, '<-', r.defender_name);
  if (rows.length>60) console.log('   ...', rows.length-60, 'more');
}
await shows('LE Flowers','2018-03-01','2018-06-01');
await shows('Illustratus','2018-03-01','2018-11-01');
await shows('DeathReapers','2018-03-25','2018-05-05');
await shows('Serpentem Empire','2018-03-01','2018-06-01');
await shows('Immortalish','2018-03-01','2018-06-01');
await pool.end();
