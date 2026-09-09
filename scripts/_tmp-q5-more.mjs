import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
for (const g of ["Nether's Ascent","Nethers Ascent","Ha Ha United","HaHaUnited","Wrath of Poseidon","Fantasy","Property of Spases","FinalFront","Imperial","Emorians","The Simple Ones","Mystic Woods","Merashold"]) {
  const { rows } = await pool.query(
    `select to_char(date_trunc('month',exchange_time),'YYYY-MM') m, count(*) n
     from territory_exchanges where attacker_name=$1 and exchange_time >= '2019-07-01' and exchange_time < '2020-04-01'
     group by 1 order by 1`, [g]);
  const { rows: ex } = await pool.query(`select min(exchange_time) f, max(exchange_time) l, count(*) n from territory_exchanges where attacker_name=$1`, [g]);
  console.log(g.padEnd(20)+' ALL n='+ex[0].n+' '+(ex[0].f?ex[0].f.toISOString().slice(0,10)+'..'+ex[0].l.toISOString().slice(0,10):'')+'  || '+rows.map(r=>r.m.slice(2)+':'+r.n).join('  '));
}
console.log('\n--- daily captures ON Imperial, 25 Aug - 10 Sep 2019 (UTC) ---');
{ const { rows } = await pool.query(
  `select to_char(exchange_time::date,'MM-DD') d, count(*) n, count(distinct attacker_name) atk
   from territory_exchanges where defender_name='Imperial' and exchange_time>='2019-08-25' and exchange_time<'2019-09-11' group by 1 order by 1`);
  for (const r of rows) console.log('  '+r.d+'  taken from Imperial: '+String(r.n).padStart(4)+'  by '+r.atk+' guilds'); }
console.log('\n--- Luminosity daily, 1-20 Sep 2019 ---');
{ const { rows } = await pool.query(
  `select to_char(exchange_time::date,'MM-DD') d, count(*) n from territory_exchanges where attacker_name='Luminosity' and exchange_time>='2019-09-01' and exchange_time<'2019-09-21' group by 1 order by 1`);
  console.log('  '+rows.map(r=>r.d+':'+r.n).join('  ')); }
console.log('\n--- House of Sentinels daily, Oct-Nov 2019 ---');
{ const { rows } = await pool.query(
  `select to_char(exchange_time::date,'MM-DD') d, count(*) n from territory_exchanges where attacker_name='House of Sentinels' and exchange_time>='2019-10-01' and exchange_time<'2019-12-01' group by 1 order by 1`);
  console.log('  '+rows.map(r=>r.d+':'+r.n).join('  ')); }
await pool.end();
