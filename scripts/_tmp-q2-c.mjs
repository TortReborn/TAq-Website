import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
async function q(label, sql, p=[]) { const {rows}=await pool.query(sql,p); console.log('--- '+label); console.table(rows); }
for (const g of ['LE Flowers','Serpentem Empire','Illustratus','DeathReapers','Immortalish']) {
  const { rows } = await pool.query(
    `SELECT max(exchange_time) last_any FROM territory_exchanges WHERE (attacker_name=$1 OR defender_name=$1) AND exchange_time < '2018-04-30'`, [g]);
  const { rows: r2 } = await pool.query(
    `SELECT count(*)::int n FROM territory_exchanges WHERE (attacker_name=$1 OR defender_name=$1) AND exchange_time >= '2018-03-30' AND exchange_time < '2018-10-09'`, [g]);
  const { rows: r3 } = await pool.query(
    `SELECT count(*)::int n FROM territory_exchanges WHERE attacker_name=$1 AND exchange_time >= '2018-03-30' AND exchange_time < '2018-10-09'`, [g]);
  console.log(g.padEnd(18), 'last appearance before 30 Apr:', r2 && rows[0].last_any ? rows[0].last_any.toISOString().slice(0,16):'-', '| rows 30Mar-8Oct:', r2[0].n, '| captures 30Mar-8Oct:', r3[0].n);
}
await q('Illustratus by month 2018', `SELECT to_char(date_trunc('month',exchange_time),'YYYY-MM') m, count(*) FILTER (WHERE attacker_name='Illustratus')::int captures, count(*) FILTER (WHERE defender_name='Illustratus')::int losses FROM territory_exchanges WHERE (attacker_name='Illustratus' OR defender_name='Illustratus') AND exchange_time>='2018-01-01' AND exchange_time<'2019-01-01' GROUP BY 1 ORDER BY 1`);
await pool.end();
