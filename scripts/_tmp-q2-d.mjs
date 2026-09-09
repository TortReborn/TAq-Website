import fs from 'fs';
import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const tl = JSON.parse(fs.readFileSync('data/wiki/research/ffa-timeline.json','utf8'));
const m = tl.lists.find(l=>l.date==='2018-03-24');
const ffa = [...(m.territories||[]), ...(m.alsoUnassigned||[])];

console.log('== Super Empire April victims (contested only)');
let { rows } = await pool.query(
 `SELECT defender_name, count(*)::int n FROM territory_exchanges
  WHERE attacker_name='The Super Empire' AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
  AND NOT (territory = ANY($1)) GROUP BY 1 ORDER BY n DESC LIMIT 15`, [ffa]);
console.table(rows);

console.log('== Super Empire April top territories (contested)');
({ rows } = await pool.query(
 `SELECT territory, count(*)::int n FROM territory_exchanges
  WHERE attacker_name='The Super Empire' AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
  AND NOT (territory = ANY($1)) GROUP BY 1 ORDER BY n DESC LIMIT 10`, [ffa]));
console.table(rows);

// hold times: for each capture by guild G, find the next exchange of that territory
async function holds(g, from, to) {
  const { rows } = await pool.query(
   `WITH e AS (SELECT territory, exchange_time, attacker_name,
       lead(exchange_time) OVER (PARTITION BY territory ORDER BY exchange_time) nxt
     FROM territory_exchanges WHERE exchange_time>=$2 AND exchange_time<$3::timestamptz + interval '30 days')
    SELECT count(*)::int n,
      count(*) FILTER (WHERE nxt IS NULL)::int still_held,
      round(EXTRACT(epoch FROM percentile_cont(0.5) WITHIN GROUP (ORDER BY nxt-exchange_time))/60)::int median_min,
      round(EXTRACT(epoch FROM max(nxt-exchange_time))/60)::int max_min
    FROM e WHERE attacker_name=$1 AND exchange_time>=$2 AND exchange_time<$3`, [g, from, to]);
  console.log(g.padEnd(18), JSON.stringify(rows[0]));
}
console.log('== hold times, April 2018 captures (minutes)');
for (const g of ['The Super Empire','Nature Kingdom','Nihil','vsauce','Flosh','Mark RPG Clan','DiamondDeities'])
  await holds(g, '2018-04-01','2018-05-01');

console.log('== DiamondDeities April territories');
({ rows } = await pool.query(
 `SELECT territory, count(*)::int n FROM territory_exchanges
  WHERE attacker_name='DiamondDeities' AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
  GROUP BY 1 ORDER BY n DESC`));
console.table(rows);
console.log('== DiamondDeities April defenders');
({ rows } = await pool.query(
 `SELECT defender_name, count(*)::int n FROM territory_exchanges
  WHERE attacker_name='DiamondDeities' AND exchange_time>='2018-04-01' AND exchange_time<'2018-05-01'
  GROUP BY 1 ORDER BY n DESC`));
console.table(rows);
console.log('== vsauce rows');
({ rows } = await pool.query(
 `SELECT exchange_time, territory, defender_name FROM territory_exchanges WHERE attacker_name='vsauce' ORDER BY 1`));
for (const r of rows) console.log('  ', r.exchange_time.toISOString().slice(0,16), r.territory, '<-', r.defender_name);
await pool.end();
