import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
for (const p of ['HHU','LxT','TNA','Fux','NYM']) {
  const { rows } = await pool.query(
    `select defender_name g, count(*) n, min(exchange_time) f, max(exchange_time) l
     from territory_exchanges where defender_name ilike $1 group by 1 order by n desc limit 5`, ['%'+p+'%']);
  console.log('DEF '+p+': '+(rows.length?rows.map(r=>r.g+' n='+r.n+' '+r.f.toISOString().slice(0,10)+'..'+r.l.toISOString().slice(0,10)).join(' | '):'none'));
}
// monthly activity for guilds of interest
for (const g of ['House of Sentinels','Merashold','The Tempest','Luminosity','Solis Crudelia','Hyperion Faction','Blacklisted','IceBlue Team','Vindicator','BlueStoneGroup','Spectral Cabbage','TheNoLifes']) {
  const { rows } = await pool.query(
    `select to_char(date_trunc('month',exchange_time),'YYYY-MM') m, count(*) n
     from territory_exchanges where attacker_name=$1 and exchange_time >= '2019-06-01' and exchange_time < '2020-04-01'
     group by 1 order by 1`, [g]);
  console.log(g.padEnd(20)+' '+rows.map(r=>r.m.slice(2)+':'+r.n).join('  '));
}
await pool.end();
