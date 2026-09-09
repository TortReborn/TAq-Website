import pg from 'pg';
import { createRequire } from 'module';
const { Pool } = pg;
const req = createRequire(import.meta.url);
const DB = req('./lib/db-config.cjs');
const pool = new Pool(DB.prod());
const q=(s,p)=>pool.query(s,p).then(r=>r.rows);
for (const g of ['House of Sentinels','Nethers Ascent']) {
  const ex=(await q(`select min(exchange_time) f,max(exchange_time) l,count(*) n from territory_exchanges where attacker_name=$1 or defender_name=$1`,[g]))[0];
  console.log('=== '+g+'  rows(either side)='+ex.n+'  '+ex.f.toISOString().slice(0,10)+' .. '+ex.l.toISOString().slice(0,10));
  const rows=await q(`select to_char(date_trunc('month',exchange_time),'YYYY-MM') m,count(*) n from territory_exchanges where attacker_name=$1 group by 1 order by 1`,[g]);
  console.log('   captures by month: '+rows.map(r=>r.m+':'+r.n).join('  '));
  const last=(await q(`select max(exchange_time) l from territory_exchanges where attacker_name=$1`,[g]))[0].l;
  console.log('   last capture: '+last.toISOString());
  // peak holdings during Oct-Nov 2019
  for (const t of ['2019-10-31 23:59:00+00','2019-11-30 23:59:00+00','2020-03-01 00:00:00+00']){
    const rr=await q(`select count(*) n from (select distinct on (territory) territory, attacker_name from territory_exchanges where exchange_time<=$1 order by territory, exchange_time desc) s where attacker_name=$2`,[t,g]);
    console.log('   holdings '+t.slice(0,10)+': '+rr[0].n);
  }
}
await pool.end();
